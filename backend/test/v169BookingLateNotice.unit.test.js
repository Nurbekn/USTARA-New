'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler,idOf}=require('../controllers/bookingLateNoticeV169');
const start=new Date('2026-11-21T11:00:00Z');
const now=new Date('2026-11-21T10:40:00Z');
function setup({role='customer',profileId=4,exists=true,status='confirmed',clock=now,stored=null,fail=null,minutes=10}={}) {
 const state={queries:[],commits:0,rollbacks:0,releases:[],stored};
 const client={async query(sql,params=[]) {
   state.queries.push({sql,params});
   if(sql===fail) throw Error('connection failed');
   if(sql==='BEGIN')return {};
   if(sql==='COMMIT'){state.commits++;return {};}
   if(sql==='ROLLBACK'){state.rollbacks++;return {};}
   if(sql.includes('FROM bookings')&&sql.includes('FOR UPDATE')) return exists?{rowCount:1,rows:[{id:91,status,booking_time:start}]}:{rowCount:0,rows:[]};
   if(sql.startsWith('SELECT minutes_late')) return state.stored?{rowCount:1,rows:[state.stored]}:{rowCount:0,rows:[]};
   if(sql.includes('clock_timestamp() AS now'))return {rowCount:1,rows:[{now:clock}]};
   if(sql.startsWith('INSERT INTO booking_late_notices')){state.stored={minutes_late:params[1],created_at:clock};return {rowCount:1,rows:[state.stored]};}
   throw Error('unexpected SQL: '+sql.slice(0,70));
 },release:destroy=>state.releases.push(destroy)};
 const req={user:{role,profileId},params:{id:'91'},body:{minutes}};
 const res={code:200,headers:{},body:null,set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
 return {state,req,res,run:()=>createHandler({connect:async()=>client})(req,res)};
}
test('#101 guards invalid owner, IDs and exact minutes before DB connection',async()=>{
 assert.equal(idOf('1'),1);assert.equal(idOf('01'),null);assert.equal(idOf('2147483648'),null);
 const foreignRole=setup({role:'barber'});await foreignRole.run();assert.equal(foreignRole.res.code,403);assert.equal(foreignRole.state.queries.length,0);
 const bad=setup({minutes:11});await bad.run();assert.equal(bad.res.code,400);assert.equal(bad.state.queries.length,0);
 const extra=setup();extra.req.body={minutes:10,booking_time:'forged'};await extra.run();assert.equal(extra.res.code,400);
 const invalidId=setup();invalidId.req.params.id='91 OR TRUE';await invalidId.run();assert.equal(invalidId.res.code,400);
 const noProfile=setup({profileId:null});await noProfile.run();assert.equal(noProfile.res.code,403);
});
test('#101 only owned active bookings can be notified',async()=>{
 const foreign=setup({exists:false});await foreign.run();assert.equal(foreign.res.code,404);assert.equal(foreign.state.rollbacks,1);
 const inactive=setup({status:'cancelled'});await inactive.run();assert.equal(inactive.res.code,409);assert.equal(inactive.state.stored,null);
 const matched=setup();await matched.run();assert.deepEqual(matched.state.queries.find(q=>q.sql.includes('FROM bookings')).params,[91,4]);
 assert.match(matched.state.queries.find(q=>q.sql.includes('FROM bookings')).sql,/FOR UPDATE/);
 assert.equal(matched.res.headers['Cache-Control'],'no-store');
});
test('#101 server-clock window rejects early and overdue notices',async()=>{
 const early=setup({clock:new Date(start.getTime()-2*60*60*1000-1)});await early.run();assert.equal(early.res.code,409);assert.equal(early.res.body.code,'outside_window');
 const late=setup({clock:new Date(start.getTime()+10*60*1000+1)});await late.run();assert.equal(late.res.code,409);assert.equal(late.state.stored,null);
});
test('#101 persists once, replay is harmless, and changed repeat is rejected',async()=>{
 const first=setup();await first.run();assert.equal(first.res.code,201);assert.equal(first.res.body.minutes,10);assert.equal(first.state.commits,1);
 assert.match(first.state.queries.find(q=>q.sql.startsWith('INSERT INTO')).sql,/INSERT INTO booking_late_notices/);
 const repeated=setup({stored:first.state.stored});await repeated.run();assert.equal(repeated.res.code,200);assert.equal(repeated.res.body.replayed,true);
 assert.equal(repeated.state.queries.some(q=>q.sql.startsWith('INSERT')),false);
 const mismatch=setup({stored:first.state.stored,minutes:15});await mismatch.run();assert.equal(mismatch.res.code,409);assert.equal(mismatch.res.body.code,'notice_exists');
});
test('#101 failure / uncertain COMMIT never returns success',async()=>{
 const broken=setup({fail:'BEGIN'});await broken.run();assert.equal(broken.res.code,503);assert.equal(broken.state.commits,0);
 const unknown=setup({fail:'COMMIT'});await unknown.run();assert.equal(unknown.res.code,503);assert.deepEqual(unknown.state.releases,[true]);
});
test('#101 route, booking projections and migration are wired',()=>{
 const root=path.resolve(__dirname,'..');const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 assert.match(read('routes/bookings.js'),/router\.post\("\/:id\/late-notice"/);
 assert.match(read('controllers/bookingsController.js'),/AS late_notice/g);
 assert.match(read('database/migrations/20261223_booking_late_notices.sql'),/PRIMARY KEY REFERENCES bookings\(id\) ON DELETE CASCADE/);
 assert.match(read('database/bootstrap.sql'),/20261223_booking_late_notices/);
 assert.match(read('database/bootstrap/verify.sql'),/booking_late_notices/);
});
