'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
const prior=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:calendar}=require('../controllers/calendarExceptionsController');
const {createHandlers:breaks}=require('../controllers/breakRulesController');
const {scheduleActor,lockScheduleOwner,ensureCurrentDay}=require('../services/barberScheduleWriteGuard');
if(prior)require.cache[dbPath]=prior;else delete require.cache[dbPath];
const actor={role:'barber',profileId:7,id:12};
const date='2035-01-07';
const row=(...rows)=>({rows,rowCount:rows.length});
function fixture({owner=true,dates=['2035-01-01','2035-01-01'],commitError=false,rollbackError=false,
   queryError=null,conflict=false,account=null}={}){
 const calls=[],released=[];let index=0,connects=0;
 const db={async connect(){connects++;return {async query(sql,args=[]){
   calls.push({sql,args});
   if(sql==='COMMIT'&&commitError)throw new Error('connection dropped after commit');
   if(sql==='ROLLBACK'&&rollbackError)throw new Error('connection dropped during rollback');
   if(queryError&&sql.includes(queryError.when))throw Object.assign(new Error('DB secrets'),{code:queryError.code});
   if(sql.includes('SELECT b.id FROM barbers b JOIN users u'))return owner?row({id:7}):row();
   if(sql.includes('::date::text AS today'))return row({today:dates[Math.min(index++,dates.length-1)]});
   if(sql.includes('SELECT b.id FROM bookings b'))return conflict?row({id:91}):row();
   return row();
  },release(isBroken){released.push(isBroken===true);}};}};
 function res(){return {statusCode:200,headers:{},body:null,
   set(k,v){this.headers[k]=v;return this;},status(s){this.statusCode=s;return this;},json(b){this.body=b;return this;}};}
 async function run(kind,method,body,user=account||actor){
  const reply=res(); const handlers=kind==='calendar'?calendar(db):breaks(db);
  await handlers[method]({user,body,params:{date}},reply);return reply;
 }
 const callSave=(user)=>run('calendar','save',{dates:[{date,is_closed:true}]},user);
 const callRemove=(user)=>run('calendar','remove',{},user);
 const callWeekly=(user)=>run('breaks','weekly',{day_of_week:2,breaks:[]},user);
 const callDated=(user)=>run('breaks','dated',{date,breaks:[{start:'12:00',end:'12:30'}]},user);
 return {calls,released,run,callSave,callRemove,callWeekly,callDated,get connects(){return connects;}};
}
const queries=f=>f.calls.map(x=>x.sql);
for(const [name,call] of [['calendar save','callSave'],['calendar remove','callRemove'],
 ['break weekly','callWeekly'],['break dated','callDated']]){
 test('v111: '+name+' rejects mismatched account before any write',async()=>{
  const f=fixture({owner:false}),r=await f[call]();
  assert.equal(r.statusCode,403);assert.equal(r.body.code,'barber_unavailable');
  assert.ok(!queries(f).some(q=>/^(INSERT|UPDATE|DELETE)/.test(q)));
  assert.ok(!queries(f).some(q=>q.includes('pg_advisory_xact_lock')));
  assert.equal(f.released.length,1);
  assert.equal(queries(f).at(-1),'ROLLBACK');
 });
 test('v111: '+name+' uses identity locks before shared advisory lock and DML',async()=>{
  const f=fixture(),r=await f[call]();
  assert.equal(r.statusCode,200);
  const sql=queries(f),owner=sql.findIndex(q=>q.includes('FOR SHARE OF b,u'));
  const mutex=sql.findIndex(q=>q.includes('pg_advisory_xact_lock'));
  const write=sql.findIndex(q=>/^(INSERT INTO barber_|UPDATE barber_|DELETE FROM barber_)/.test(q));
  assert.ok(owner>=0&&owner<mutex&&mutex<write,sql.join('\n'));
  assert.equal(sql.at(-1),'COMMIT');assert.deepEqual(f.released,[false]);
  assert.equal(r.headers['Cache-Control'],'no-store');
 });
 test('v111: '+name+' does not claim success if COMMIT acknowledgement is lost',async()=>{
  const f=fixture({commitError:true}),r=await f[call]();
  assert.equal(r.statusCode,503);assert.equal(r.body.code,'calendar_result_unknown');
  assert.doesNotMatch(JSON.stringify(r.body),/connection dropped/);
  assert.deepEqual(f.released,[true]);
  assert.equal(queries(f).filter(q=>q==='ROLLBACK').length,0);
 });
 test('v111: '+name+' rejects stale or invalid signed-in profile before transaction',async()=>{
  for(const user of [{...actor,id:undefined},{...actor,profileId:'7e2'},
    {...actor,role:'customer'},{...actor,id:-3},{...actor,profileId:2**40}]){
   const f=fixture(),r=await f[call](user);
   assert.ok([401,403].includes(r.statusCode));assert.equal(f.connects,0);
  }
 });
}
for(const name of ['callSave','callRemove','callDated']){
 test('v111: '+name+' checks PostgreSQL date after lock and immediately before COMMIT',async()=>{
  const f=fixture(),r=await f[name]();assert.equal(r.statusCode,200);
  const sql=queries(f),dateIdx=sql.flatMap((q,i)=>q.includes('::date::text AS today')?[i]:[]);
  assert.equal(dateIdx.length,2);assert.ok(dateIdx[0]>sql.findIndex(q=>q.includes('pg_advisory_xact_lock')));
  assert.equal(sql[dateIdx[1]+1],'COMMIT');
 });
 test('v111: '+name+' rolls back all edits if day changes during transaction',async()=>{
  const f=fixture({dates:['2035-01-01','2035-01-08']}),r=await f[name]();
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'calendar_day_changed');
  assert.equal(queries(f).at(-1),'ROLLBACK');assert.equal(queries(f).includes('COMMIT'),false);
 });
 test('v111: '+name+' blocks old date immediately after PostgreSQL clock check',async()=>{
  const f=fixture({dates:['2035-01-08']}),r=await f[name]();
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'calendar_day_changed');
  assert.ok(!queries(f).some(q=>/^(INSERT|DELETE|UPDATE) (?:FROM|INTO)? ?barber_/.test(q)));
 });
}
test('v111: weekday break update never requires a particular calendar date',async()=>{
 const f=fixture({dates:['2035-01-08']}),r=await f.callWeekly();
 assert.equal(r.statusCode,200);assert.ok(!queries(f).some(q=>q.includes('::date::text AS today')));
});
test('v111: calendar conflicts are fully rolled back, never persisted',async()=>{
 const f=fixture({conflict:true}),r=await f.callSave();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'existing_booking_conflict');
 assert.equal(queries(f).at(-1),'ROLLBACK');
});
test('v111: transient deadlocks return a stable 409 without leaking SQL details',async()=>{
 const f=fixture({queryError:{when:'pg_advisory_xact_lock',code:'40P01'}}),r=await f.callDated();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'calendar_busy');
 assert.doesNotMatch(JSON.stringify(r.body),/secrets/);
});
test('v111: rollback connection failure discards poisoned pool connection',async()=>{
 const f=fixture({owner:false,rollbackError:true}),r=await f.callWeekly();
 assert.equal(r.statusCode,403);assert.deepEqual(f.released,[true]);
});
test('v111: calendar owner guard refuses inactive user and has an immutable SELECT contract',async()=>{
 const f=fixture();await f.callSave();
 const q=f.calls.find(c=>c.sql.includes('FROM barbers b JOIN users u'));
 assert.deepEqual(q.args,[7,12]);
 assert.match(q.sql,/b\.user_id=\$2/);assert.match(q.sql,/u\.deactivated_at IS NULL/);
 assert.match(q.sql,/u\.role='barber'/);assert.match(q.sql,/b\.verification_status='approved'/);
});
test('v111: signed-in actor must have bounded numeric IDs',()=>{
 assert.deepEqual(scheduleActor({...actor,profileId:'7',id:'12'}),{barberId:7,userId:12});
 assert.throws(()=>scheduleActor({...actor,id:2147483648}),{status:401});
 assert.throws(()=>scheduleActor({...actor,role:'admin'}),{status:403});
});
test('v111: guard fails closed when DB clock is missing',async()=>{
 await assert.rejects(ensureCurrentDay({query:async()=>row()},[date]),{status:503,code:'calendar_unavailable'});
});
test('v111: only after active owner is checked is advisory lock requested',async()=>{
 const calls=[];const client={query:async(sql)=>{calls.push(sql);return sql.includes('FROM barbers b')?row():row();}};
 await assert.rejects(lockScheduleOwner(client,{barberId:7,userId:12}),{status:403});
 assert.equal(calls.length,1);
});
