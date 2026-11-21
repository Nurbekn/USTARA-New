'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {requestHandler,confirmHandler,validId}=require('../controllers/bookingCheckInV170');
const start=new Date('2026-11-21T11:00:00Z');
const now=new Date('2026-11-21T10:50:00Z');
function setup({role='customer',profileId=4,exists=true,status='confirmed',clock=now,stored=null,fail=null,mode='request'}={}) {
 const state={queries:[],commits:0,rollbacks:0,releases:[],stored};
 const client={async query(sql,params=[]) {
   state.queries.push({sql,params});
   if(sql===fail)throw Error('DB unavailable');
   if(sql==='BEGIN')return {};
   if(sql==='COMMIT'){state.commits++;return {};}
   if(sql==='ROLLBACK'){state.rollbacks++;return {};}
   if(sql.includes('FROM bookings')&&sql.includes('FOR UPDATE')) return exists?{rowCount:1,rows:[{id:99,status,booking_time:start}]}:{rowCount:0,rows:[]};
   if(sql.startsWith('SELECT requested_at')) return state.stored?{rowCount:1,rows:[state.stored]}:{rowCount:0,rows:[]};
   if(sql.includes('clock_timestamp() AS now'))return {rowCount:1,rows:[{now:clock}]};
   if(sql.includes('INSERT INTO booking_checkins')) {state.stored={requested_at:clock,confirmed_at:null};return {rowCount:1,rows:[state.stored]};}
   if(sql.includes('UPDATE booking_checkins')) {state.stored={...state.stored,confirmed_at:clock};return {rowCount:1,rows:[state.stored]};}
   throw Error('Unexpected query '+sql.slice(0,120));
 },release:destroy=>state.releases.push(destroy)};
 const req={user:{role,profileId},params:{id:'99'},body:{}};
 const res={code:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 return {state,req,res,run:()=> (mode==='confirm'?confirmHandler:requestHandler)({connect:async()=>client})(req,res)};
}
test('#102 validates IDs, roles and exact empty body before contacting DB',async()=>{
 assert.equal(validId('99'),99);assert.equal(validId('00'),null);assert.equal(validId('2147483648'),null);
 for(const opts of [{role:'barber'},{profileId:null},{role:'admin'},{role:'customer',profileId:2147483648}]){
   const x=setup(opts);await x.run();assert.equal(x.res.code,403);assert.equal(x.state.queries.length,0);
 }
 const bad=setup();bad.req.params.id='99 OR TRUE';await bad.run();assert.equal(bad.res.code,400);
 const body=setup();body.req.body={confirmed:true};await body.run();assert.equal(body.res.code,400);
 const wrong=setup({mode:'confirm'});await wrong.run();assert.equal(wrong.res.code,403);
});
test('#102 request only for owned, confirmed bookings',async()=>{
 const foreign=setup({exists:false});await foreign.run();assert.equal(foreign.res.code,404);
 const inactive=setup({status:'cancelled'});await inactive.run();assert.equal(inactive.res.code,409);
 const pending=setup({status:'pending'});await pending.run();assert.equal(pending.res.code,409);
 const valid=setup();await valid.run();assert.equal(valid.res.code,201);
 assert.deepEqual(valid.state.queries.find(q=>q.sql.includes('FROM bookings')).params,[99,4]);
 assert.match(valid.state.queries.find(q=>q.sql.includes('FROM bookings')).sql,/customer_id=\$2 FOR UPDATE/);
 assert.equal(valid.res.headers['Cache-Control'],'no-store');
 assert.equal(valid.res.body.confirmedAt,null);
});
test('#102 database-clock window is closed before -90 and after +30 minutes',async()=>{
 const before=setup({clock:new Date(start.getTime()-90*60000-1)});await before.run();assert.equal(before.res.code,409);assert.equal(before.res.body.code,'outside_window');
 const after=setup({clock:new Date(start.getTime()+30*60000+1)});await after.run();assert.equal(after.res.code,409);
 for(const clock of [new Date(start.getTime()-90*60000),new Date(start.getTime()+30*60000)]){
   const x=setup({clock});await x.run();assert.equal(x.res.code,201);
 }
});
test('#102 repeated request is idempotent; it never claims barber confirmation',async()=>{
 const first=setup();await first.run();assert.equal(first.state.commits,1);
 const again=setup({stored:first.state.stored,clock:new Date(start.getTime()+90*60000)});
 await again.run();assert.equal(again.res.code,200);assert.equal(again.res.body.replayed,true);
 assert.equal(again.state.queries.some(q=>q.sql.includes('INSERT INTO')),false);
 assert.equal(again.res.body.confirmedAt,null);
});
test('#102 only booking barber may confirm a real customer request',async()=>{
 const barber=setup({mode:'confirm',role:'barber',profileId:9});await barber.run();assert.equal(barber.res.code,409);assert.equal(barber.res.body.code,'not_requested');
 const foreign=setup({mode:'confirm',role:'barber',exists:false});await foreign.run();assert.equal(foreign.res.code,404);
 const inactive=setup({mode:'confirm',role:'barber',stored:{requested_at:now,confirmed_at:null},status:'completed'});await inactive.run();assert.equal(inactive.res.code,409);
 const req=setup();await req.run();
 const confirm=setup({mode:'confirm',role:'barber',profileId:9,stored:req.state.stored});await confirm.run();
 assert.equal(confirm.res.code,201);assert.ok(confirm.res.body.confirmedAt);assert.deepEqual(confirm.state.queries.find(q=>q.sql.includes('FROM bookings')).params,[99,9]);
 assert.match(confirm.state.queries.find(q=>q.sql.includes('FROM bookings')).sql,/barber_id=\$2 FOR UPDATE/);
 assert.equal(confirm.state.queries.some(q=>q.sql.includes('UPDATE bookings')),false);
 const repeated=setup({mode:'confirm',role:'barber',stored:confirm.state.stored});await repeated.run();assert.equal(repeated.res.code,200);
 assert.equal(repeated.res.body.replayed,true);
 assert.equal(repeated.state.queries.some(q=>q.sql.includes('UPDATE booking_checkins')),false);
});
test('#102 uncertain commit / DB errors never return success',async()=>{
 const missing=setup({fail:'BEGIN'});await missing.run();assert.equal(missing.res.code,503);
 const unknown=setup({fail:'COMMIT'});await unknown.run();assert.equal(unknown.res.code,503);assert.deepEqual(unknown.state.releases,[true]);
});
test('#102 API, migration and server-projected read fields are all wired',()=>{
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('routes/bookings.js'),/router.post\("\/:id\/check-in"/);
 assert.match(read('routes/bookings.js'),/router.post\("\/:id\/check-in\/confirm"/);
 assert.equal((read('controllers/bookingsController.js').match(/AS check_in/g)||[]).length,5);
 assert.match(read('database/migrations/20261224_booking_customer_checkins.sql'),/PRIMARY KEY REFERENCES bookings\(id\) ON DELETE CASCADE/);
 const sql=read('database/migrations/20261224_booking_customer_checkins.sql');
 assert.match(sql,/AFTER UPDATE OF booking_time ON bookings/);
 assert.match(sql,/DELETE FROM booking_checkins WHERE booking_id = NEW.id/);
 assert.match(sql,/OLD.booking_time IS DISTINCT FROM NEW.booking_time/);
 assert.match(read('database/bootstrap.sql'),/20261224_booking_customer_checkins/);
 assert.match(read('database/bootstrap/verify.sql'),/booking_checkins/);
});
