'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db'),original=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers:calendar,validateException}=require('../controllers/calendarExceptionsController');
const {createHandlers:breaks}=require('../controllers/breakRulesController');
const {isBrokenScheduleConnection}=require('../services/barberScheduleWriteGuard');
if(original)require.cache[dbPath]=original;else delete require.cache[dbPath];
const user={role:'barber',profileId:7,id:12};
const date='2035-01-07';
function fixture({faultCode='08006',faultMessage='socket disconnected',faultOn='pg_advisory_xact_lock'}={}){
 const sql=[],released=[];
 const db={async connect(){return {async query(query){
  sql.push(query);
  if(query.includes(faultOn))throw Object.assign(new Error(faultMessage),{code:faultCode});
  if(query.includes('FROM barbers b JOIN users u'))return {rowCount:1,rows:[{id:7}]};
  if(query.includes('::date::text AS today'))return {rowCount:1,rows:[{today:'2035-01-01'}]};
  return {rowCount:0,rows:[]};
 },release(dirty){released.push(dirty===true);}};}};
 async function send(type,action){
  const res={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},
   status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
  const body=type==='calendar'?
   {dates:[{date,is_closed:true}]}:
   action==='weekly'?{day_of_week:2,breaks:[]}:{date,breaks:[]};
  await (type==='calendar'?calendar(db):breaks(db))[action]({user,body,params:{date}},res);
  return res;
 }
 return {send,sql,released};
}
for(const [type,action] of [['calendar','save'],['calendar','remove'],['breaks','weekly'],['breaks','dated']]){
 for(const fault of ['08006','ECONNRESET','57P01']){
  test(`v113: ${type}.${action} discards ${fault} even if rollback replies`,async()=>{
   const f=fixture({faultCode:fault}),r=await f.send(type,action);
   assert.equal(r.statusCode,503);assert.equal(r.body.code,'calendar_unavailable');
   assert.equal(f.sql.at(-1),'ROLLBACK');assert.deepEqual(f.released,[true]);
   assert.doesNotMatch(JSON.stringify(r.body),/socket disconnected/);
  });
 }
 test(`v113: ${type}.${action} does not poison pool on non-transport DB error`,async()=>{
  const f=fixture({faultCode:'23505'}),r=await f.send(type,action);
  assert.equal(r.statusCode,503);assert.deepEqual(f.released,[false]);
 });
}
test('v113: transport detection covers nested socket failures and reject admin shutdown',()=>{
 for(const code of ['08000','08P01','08006','ECONNRESET','EPIPE','ETIMEDOUT','57P01','57P02','57P03'])
  assert.equal(isBrokenScheduleConnection({code}),true,code);
 assert.equal(isBrokenScheduleConnection({cause:{code:'ECONNRESET'}}),true);
 assert.equal(isBrokenScheduleConnection({message:'Connection terminated unexpectedly'}),true);
 for(const code of ['23505','40P01','57014','55P03'])assert.equal(isBrokenScheduleConnection({code}),false);
});
test('v113: calendar and special-day break input require 5-minute steps',()=>{
 const valid={date,is_closed:false,start_time:'09:00',end_time:'18:00',break_start:'13:00',break_end:'14:00'};
 assert.equal(validateException(valid).end_time,'18:00');
 for(const key of ['start_time','end_time','break_start','break_end']){
  const bad={...valid,[key]:key.includes('start')?'09:02':'18:04'};
  assert.throws(()=>validateException(bad),{status:400});
 }
});
test('v113: validation failure does not cache private calendar errors',async()=>{
 const f=fixture(),res=await f.send('calendar','save');
 assert.equal(res.headers['Cache-Control'],'no-store');
 const bad={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},
  status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 await calendar({connect:async()=>{throw Error('should not connect');}}).save({user,body:{dates:[]}},bad);
 assert.equal(bad.statusCode,400);assert.equal(bad.headers['Cache-Control'],'no-store');
});
test('v113: read-only snapshot drops a server-shutdown connection despite rollback',async()=>{
 const releases=[];const {readScheduleSnapshot}=require('../services/barberScheduleWriteGuard');
 const db={async connect(){return {async query(sql){
  if(sql.includes('FROM barbers b JOIN users u'))throw Object.assign(Error('shutdown'),{code:'57P01'});
  return {rowCount:0,rows:[]};
 },release(broken){releases.push(broken===true);}};}};
 await assert.rejects(readScheduleSnapshot(db,{barberId:7,userId:12},async()=>null),{code:'57P01'});
 assert.deepEqual(releases,[true]);
});
test('v113: break-rule validation errors carry no-store and touch no database',async()=>{
 const db={async connect(){throw Error('must not connect');}};
 const response={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},
  status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 await breaks(db).dated({user,body:{date,breaks:[{start:'13:02',end:'14:00'}]}},response);
 assert.equal(response.statusCode,400);assert.equal(response.headers['Cache-Control'],'no-store');
});
