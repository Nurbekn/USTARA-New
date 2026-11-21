'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db'),previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:exceptions}=require('../controllers/calendarExceptionsController');
const {createHandlers:breaks}=require('../controllers/breakRulesController');
const {readScheduleSnapshot}=require('../services/barberScheduleWriteGuard');
if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];
const user={role:'barber',id:12,profileId:7};
const row=(...rows)=>({rows,rowCount:rows.length});
function fixture({allowed=true,readError=null,rollbackError=false,commitError=false,beginError=false}={}){
 const queries=[],released=[],sessions=[];let connections=0;
 const database={
  async query(){throw Error('snapshot-bypassed-pool-query');},
  async connect(){
   connections++;const session=connections;sessions.push(session);
   return {async query(sql,params=[]){
    queries.push({sql,params,session});
    if(sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' && beginError)throw Error('begin refused');
    if(sql==='ROLLBACK' && rollbackError)throw Error('rollback connection lost');
    if(sql==='COMMIT' && commitError)throw Error('commit connection lost');
    if(readError && sql.includes(readError.on))throw Object.assign(Error('secret SQL text'),{code:readError.code||'XX000'});
    if(sql.includes('FROM barbers b JOIN users u'))return allowed?row({id:7}):row();
    if(sql.includes('FROM barber_calendar_exceptions'))return row({date:'2035-01-01',is_closed:false});
    if(sql.includes('FROM barber_weekly_breaks'))return row({day_of_week:2,start:'12:00',end:'12:30'});
    if(sql.includes('FROM barber_date_breaks'))return row({date:'2035-01-03',start:'10:00',end:'11:00'});
    return row();
   },release(broken){released.push(broken===true);}};
  }
 };
 async function call(type,account=user){
  const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},
   status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  const h=type==='calendar'?exceptions(database):breaks(database);
  await h.list({user:account},res);return res;
 }
 return {call,queries,released,sessions,get connections(){return connections;}};
}
for(const type of ['calendar','breaks']){
 test(`v112: ${type} GET authorizes active owner inside repeatable-read snapshot`,async()=>{
  const f=fixture(),r=await f.call(type);assert.equal(r.statusCode,200);
  assert.equal(r.headers['Cache-Control'],'no-store');
  const q=f.queries.map(x=>x.sql);
  assert.deepEqual(q.slice(0,2),['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',"SET LOCAL statement_timeout='10s'"]);
  const auth=f.queries[2];assert.match(auth.sql,/b\.user_id=\$2/);
  assert.match(auth.sql,/u\.deactivated_at IS NULL/);assert.match(auth.sql,/verification_status='approved'/);
  assert.doesNotMatch(auth.sql,/FOR SHARE|FOR UPDATE/);assert.deepEqual(auth.params,[7,12]);
  assert.ok(!q.some(sql=>sql.includes('pg_advisory_xact_lock')));
  assert.equal(q.at(-1),'COMMIT');assert.deepEqual(f.released,[false]);
  assert.equal(f.connections,1);
 });
 test(`v112: ${type} GET denies revoked or mismatched owner before private SELECT`,async()=>{
  const f=fixture({allowed:false}),r=await f.call(type);
  assert.equal(r.statusCode,403);assert.equal(r.body.code,'barber_unavailable');
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.ok(!f.queries.some(({sql})=>sql.includes('FROM barber_calendar_exceptions') ||
   sql.includes('FROM barber_weekly_breaks') ||sql.includes('FROM barber_date_breaks')));
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.deepEqual(f.released,[false]);
 });
 test(`v112: ${type} GET rejects forged or obsolete session before DB connect`,async()=>{
  const f=fixture();for(const actor of [null,{...user,role:'customer'},{...user,id:undefined},
    {...user,profileId:7.7},{...user,profileId:'7x'},{...user,id:2147483648}]){
   const r=await f.call(type,actor);assert.ok([401,403].includes(r.statusCode));
   assert.equal(r.headers['Cache-Control'],'no-store');
  }assert.equal(f.connections,0);
 });
 test(`v112: ${type} GET responds generically to read error and rolls back`,async()=>{
  const f=fixture({readError:{on:type==='calendar'?'FROM barber_calendar_exceptions':'FROM barber_date_breaks'}});
  const r=await f.call(type);assert.equal(r.statusCode,503);assert.equal(r.body.code,'calendar_unavailable');
  assert.doesNotMatch(JSON.stringify(r.body),/secret SQL/);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
  assert.deepEqual(f.released,[false]);assert.equal(r.headers['Cache-Control'],'no-store');
 });
 test(`v112: ${type} GET discards connection if ROLLBACK itself fails`,async()=>{
  const f=fixture({allowed:false,rollbackError:true}),r=await f.call(type);
  assert.equal(r.statusCode,403);assert.deepEqual(f.released,[true]);
 });
 test(`v112: ${type} GET does not reuse uncertain COMMIT connection`,async()=>{
  const f=fixture({commitError:true}),r=await f.call(type);
  assert.equal(r.statusCode,503);assert.deepEqual(f.released,[true]);
  assert.ok(!f.queries.some(q=>q.sql==='ROLLBACK'));
 });
}
test('v112: exceptions GET filters barber and local dates inside the authorized snapshot',async()=>{
 const f=fixture(),r=await f.call('calendar');assert.deepEqual(r.body,[{date:'2035-01-01',is_closed:false}]);
 const select=f.queries.find(q=>q.sql.includes('FROM barber_calendar_exceptions'));
 assert.deepEqual(select.params,[7]);assert.match(select.sql,/transaction_timestamp\(\)/);
 assert.match(select.sql,/LIMIT 500/);
 assert.equal(select.session,f.queries[2].session);
});
test('v112: weekly and dated breaks are read sequentially from one consistent DB snapshot',async()=>{
 const f=fixture(),r=await f.call('breaks');
 assert.deepEqual(r.body.weekly,[{day_of_week:2,start:'12:00',end:'12:30'}]);
 assert.deepEqual(r.body.dated,[{date:'2035-01-03',start:'10:00',end:'11:00'}]);
 const commands=f.queries.map(q=>q.sql);
 const w=commands.findIndex(x=>x.includes('FROM barber_weekly_breaks'));
 const d=commands.findIndex(x=>x.includes('FROM barber_date_breaks'));
 assert.ok(w>2&&d>w);assert.equal(f.queries[w].session,f.queries[d].session);
 assert.deepEqual(f.queries[w].params,[7]);assert.deepEqual(f.queries[d].params,[7]);
 assert.match(commands[d],/transaction_timestamp\(\)/);
 assert.match(commands[d],/LIMIT 800/);
});
test('v112: transport failure poisons a connection even when ROLLBACK responds',async()=>{
 const f=fixture({readError:{on:'FROM barber_calendar_exceptions',code:'08006'}});
 const r=await f.call('calendar');assert.equal(r.statusCode,503);
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.deepEqual(f.released,[true]);
});
test('v112: BEGIN error never fetches private rows and releases the client',async()=>{
 const f=fixture({beginError:true}),r=await f.call('calendar');
 assert.equal(r.statusCode,503);assert.equal(f.queries.length,1);assert.deepEqual(f.released,[false]);
});
test('v112: transaction helper propagates an error without hiding it from its caller',async()=>{
 const f=fixture({allowed:false});
 const db={connect:async()=>({query:async sql=>{
  if(sql.startsWith('SELECT b.id FROM barbers'))return row();return row();
 },release(){}})};
 await assert.rejects(readScheduleSnapshot(db,{barberId:7,userId:12},async()=>assert.fail('unreachable')),
  {status:403,code:'barber_unavailable'});
 assert.equal(f.queries.length,0);
});
