'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {caseIdOf,listOptions,mutationOf,createHandlers}=require('../controllers/adminSuspensionCasesV188');
const {createHandlers:createSuspension}=require('../controllers/adminAccountSuspensionV187');
function response(){return {statusCode:200,headers:{},payload:null,set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},json(x){this.payload=x;return this;}};}
function fake({admin=true,caseStatus='pending',revision=0,bookingStatus='confirmed',suspended=true,failOn='',rows=[]}={}){
 const calls=[];let released=false;
 const query=async(sql,args=[])=>{
  calls.push({sql,args});if(failOn&&sql.includes(failOn))throw Error('private DB details');
  if(sql.includes('FROM admin_accounts'))return {rowCount:admin?1:0,rows:admin?[{id:1}]:[]};
  if(sql.includes('FROM admin_suspension_booking_cases c')&&sql.includes('FOR UPDATE OF c'))return {rowCount:1,rows:[{id:'7',booking_id:14,user_id:20,status:caseStatus,revision}]};
  if(sql.includes('FROM admin_suspension_booking_cases c'))return {rowCount:rows.length,rows};
  if(sql.includes('SELECT status FROM bookings'))return {rowCount:1,rows:[{status:bookingStatus}]};
  if(sql.includes('SELECT admin_suspended_at FROM users'))return {rowCount:1,rows:[{admin_suspended_at:suspended?'2026-11-21T00:00:00Z':null}]};
  if(sql.startsWith('UPDATE admin_suspension_booking_cases'))return {rowCount:1,rows:[{revision:revision+1}]};
  return {rowCount:1,rows:[]};
 };
 return {query,connect:async()=>({query,release(){released=true;}}),calls,get released(){return released;}};
}
async function invoke(db,action='review',body={action:'review',expectedRevision:0},user={role:'admin',id:1}){
 const res=response();await createHandlers(db).act({user,params:{id:'7'},body},res);return res;
}
test('v188: validate case ID, pages and actions without unsafe conversions',()=>{
 for(const id of ['0','-1','1;drop','1.5','', '9999999999999999999'])assert.equal(caseIdOf(id),null);
 assert.equal(caseIdOf('7'),'7');assert.equal(listOptions({status:'open',page:'2'}).offset,50);
 for(const status of ['anything','pending,closed',''])assert.equal(listOptions({status}),null);
 for(const page of ['0','101','1.5','1 OR 1=1'])assert.equal(listOptions({page}),null);
 assert.equal(mutationOf({action:'attempt',expectedRevision:3,channel:'telegram'}).channel,'telegram');
 for(const b of [{action:'close',expectedRevision:-1},{action:'attempt',expectedRevision:0,channel:'email'},
   {action:'review',expectedRevision:0,channel:'phone'},{action:'review',expectedRevision:'0'},
   {action:'close',expectedRevision:0,channel:'other'}])assert.equal(mutationOf(b),null);
});
test('v188: unauthenticated or non-Admin cannot list or act, zero SQL',async()=>{
 const db=fake();const handlers=createHandlers(db);let res=response();
 await handlers.list({user:{role:'customer',id:1},query:{}},res);assert.equal(res.statusCode,403);
 res=await invoke(db,'review',undefined,{role:'barber',id:9});assert.equal(res.statusCode,403);
 assert.equal(db.calls.length,0);
});
test('v188: list is bounded, read only and does not include phone, chat IDs or delivered claims',async()=>{
 const rows=Array.from({length:51},(_,i)=>({id:String(i+1),revision:0,case_status:'pending',booking_id:i+1}));
 const db=fake({rows});const res=response();
 await createHandlers(db).list({user:{role:'admin',id:1},query:{page:'1',status:'open'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
 assert.equal(res.payload.rows.length,50);assert.equal(res.payload.hasMore,true);
 assert.equal(res.payload.notificationsSent,false);assert.equal(res.payload.readOnlyListing,true);
 const source=JSON.stringify(db.calls);assert.doesNotMatch(source,/DELETE FROM bookings|UPDATE bookings|INSERT INTO telegram/);
});
test('v188: inactive Admin cannot read or mutate cases',async()=>{
 const db=fake({admin:false});let res=response();
 await createHandlers(db).list({user:{role:'admin',id:1},query:{}},res);assert.equal(res.statusCode,403);
 res=await invoke(db);assert.equal(res.statusCode,403);
 assert.ok(!db.calls.some(c=>c.sql.startsWith('UPDATE admin_suspension_booking_cases')));
});
test('v188: mark reviewed uses transactional optimistic revision and append-only audit',async()=>{
 const db=fake();const res=await invoke(db);
 assert.equal(res.statusCode,200);assert.equal(res.payload.status,'reviewed');
 assert.equal(res.payload.notificationsSent,false);assert.equal(res.payload.bookingsChanged,false);
 assert.ok(db.calls.some(c=>c.sql.includes('FOR UPDATE OF c')));
 const updated=db.calls.find(c=>c.sql.startsWith('UPDATE admin_suspension_booking_cases'));
 assert.deepEqual(updated.args,['7','reviewed']);
 const event=db.calls.find(c=>c.sql.includes('INSERT INTO admin_suspension_booking_case_events'));
 assert.deepEqual(event.args,['7',1,'review',null]);
 assert.equal(db.calls.at(-1).sql,'COMMIT');assert.equal(db.released,true);
});
test('v188: operator can only log an attempt after review, never declare delivery',async()=>{
 const pending=fake();let r=await invoke(pending,'attempt',{action:'attempt',expectedRevision:0,channel:'phone'});
 assert.equal(r.statusCode,409);assert.ok(!pending.calls.some(c=>c.sql.includes('INSERT INTO admin_suspension_booking_case_events')));
 const db=fake({caseStatus:'reviewed',revision:1});r=await invoke(db,'attempt',{action:'attempt',expectedRevision:1,channel:'telegram'});
 assert.equal(r.statusCode,200);assert.equal(r.payload.status,'attempted');
 assert.equal(r.payload.notificationsSent,false);
 assert.deepEqual(db.calls.find(c=>c.sql.includes('INSERT INTO admin_suspension_booking_case_events')).args,['7',1,'attempt','telegram']);
});
test('v188: stale case revision and duplicate review fail closed',async()=>{
 const stale=fake({revision:3});assert.equal((await invoke(stale)).statusCode,409);
 assert.ok(!stale.calls.some(c=>c.sql.startsWith('UPDATE admin_suspension_booking_cases')));
 const dupe=fake({caseStatus:'reviewed'});assert.equal((await invoke(dupe)).statusCode,409);
});
test('v188: cannot close active suspended booking; can close once settled or restored',async()=>{
 let db=fake({caseStatus:'attempted',revision:2});let r=await invoke(db,'close',{action:'close',expectedRevision:2});
 assert.equal(r.statusCode,409);assert.equal(r.payload.code,'booking_still_needs_handling');
 for(const config of [{bookingStatus:'cancelled',suspended:true},{bookingStatus:'confirmed',suspended:false}]){
  db=fake({...config,caseStatus:'attempted',revision:2});
  r=await invoke(db,'close',{action:'close',expectedRevision:2});
  assert.equal(r.statusCode,200);assert.equal(r.payload.status,'closed');
 }
});
test('v188: DB/COMMIT uncertainty does not leak internals or imply successful notification',async()=>{
 const db=fake({failOn:'INSERT INTO admin_suspension_booking_case_events'});
 const r=await invoke(db);assert.equal(r.statusCode,503);assert.equal(r.payload.code,'case_action_unknown');
 assert.doesNotMatch(JSON.stringify(r.payload),/private DB details/);
 assert.ok(db.calls.some(c=>c.sql==='ROLLBACK'));
});
test('v188: suspension atomically creates follow-up cases only for new suspensions',async()=>{
 for(const role of ['customer','barber']){
  const calls=[];const client={async query(sql,args=[]){calls.push({sql,args});
    if(sql.includes('FROM admin_accounts'))return {rowCount:1,rows:[{id:1}]};
    if(sql.startsWith('SELECT id,user_id FROM'))return {rowCount:1,rows:[{id:11,user_id:20}]};
    if(sql.startsWith('SELECT id,role,admin_suspended_at FROM users'))return {rowCount:1,rows:[{id:20,role,admin_suspended_at:null}]};
    if(sql.includes('INSERT INTO admin_account_suspension_events'))return {rowCount:1,rows:[{id:5}]};
    return {rowCount:1,rows:[]};
  },release(){}};
  const db={connect:async()=>client};const res=response();
  await createSuspension(db).change({user:{role:'admin',id:1},params:{role,id:'11'},body:{action:'suspend',expectedSuspended:false,reason:'Operator review required'}},res);
  assert.equal(res.statusCode,200);
  const insert=calls.find(c=>c.sql.includes('INSERT INTO admin_suspension_booking_cases'));
  assert.ok(insert);assert.deepEqual(insert.args,[5,11]);
  assert.match(insert.sql,new RegExp('b\\.'+(role==='barber'?'barber_id':'customer_id')));
  assert.equal(calls.at(-1).sql,'COMMIT');
 }
});
test('v188: migration & routes present, booking data and outbound messaging never mutated',()=>{
 const root=path.resolve(__dirname,'..');
 const migration=fs.readFileSync(path.join(root,'database/migrations/20261231_admin_suspension_booking_cases.sql'),'utf8');
 assert.match(migration,/admin_suspension_booking_cases/);
 assert.match(migration,/admin_suspension_booking_case_events/);
 assert.doesNotMatch(migration,/DELETE FROM bookings|UPDATE bookings|sendMessage/);
 const routes=fs.readFileSync(path.join(root,'routes/admin.js'),'utf8');
 assert.match(routes,/router.get\('\/suspension-cases'/);
 assert.match(routes,/router.patch\('\/suspension-cases\/:id'/);
 const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 assert.match(bootstrap,/20261231_admin_suspension_booking_cases.sql/);
});
