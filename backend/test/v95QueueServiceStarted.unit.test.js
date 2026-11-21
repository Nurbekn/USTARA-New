'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dbPath=require.resolve('../db');
const previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];
const stamp='2026-11-19T10:05:00.000Z';
const base=(status='called',overrides={})=>({id:15,barber_id:7,queue_date:'2026-11-19',
 display_label:'Mehmon',request_key:'a'.repeat(32),status,queue_position:1,
 created_at:stamp,called_at:stamp,started_at:status==='in_service'||status==='served'?stamp:null,
 finished_at:status==='served'?stamp:null,...overrides});
const rows=a=>({rows:a,rowCount:a.length});
function fixture({ticket=base(),servicing=null,changed=true,commitFail=false,rollbackFail=false,
 authorized=true,throwOnUpdate=false}={}){
 const calls=[];let released=[],events=0,updates=0,notices=0;
 const db={async connect(){return {
  async query(sql,args=[]){calls.push({sql,args});
   if(sql==='COMMIT'&&commitFail)throw Error('network lost at COMMIT');
   if(sql==='ROLLBACK'&&rollbackFail)throw Error('rollback lost');
   if(sql.includes('SELECT b.id FROM barbers'))return rows(authorized?[{id:7}]:[]);
   if(sql.includes("AND status='called' FOR UPDATE"))return rows([]);
   if(sql.includes("AND status='in_service' FOR UPDATE"))return rows(servicing?[servicing]:[]);
   if(sql.includes('AND id=$2 FOR UPDATE'))return rows(ticket?[ticket]:[]);
   if(sql.startsWith("UPDATE walkin_queue SET status='in_service'")){
    if(throwOnUpdate)throw Error('write lost');
    updates++;return rows(changed?[base('in_service')]:[]);
   }
   if(sql.startsWith('UPDATE walkin_queue SET status=$1')){
    updates++;return rows(changed?[base(args[0])]:[]);
   }
   if(sql.includes('INSERT INTO walkin_queue_events'))events++;
   if(sql.includes('UPDATE walkin_queue_notification_outbox'))notices++;
   return rows([]);
  },release(broken){released.push(broken===true)}
 }}};
 const api=createHandlers(db);
 async function send(method,{body={expected_status:'called'},id='15',user={role:'barber',id:5,profileId:7}}={}){
  const res={statusCode:200,headers:{},body:null,
   set(k,v){this.headers[k]=v;return this},status(code){this.statusCode=code;return this},
   json(obj){this.body=obj;return this}};
  await api[method]({params:{id},body,user},res);return res;
 }
 return {send,calls,release:()=>released,events:()=>events,updates:()=>updates,notices:()=>notices};
}
test('v95 called ticket starts exactly once, preserves called timestamp and emits audit',async()=>{
 const f=fixture();const r=await f.send('startService');
 assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'in_service');
 assert.equal(r.body.entry.started_at,stamp);assert.equal(r.body.entry.called_at,stamp);
 assert.equal(r.body.replayed,false);assert.equal(f.events(),1);assert.equal(f.updates(),1);
 assert.equal(f.notices(),1);assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(f.release()[0],false);
 const queries=f.calls.map(c=>c.sql);
 assert.ok(queries.findIndex(x=>x.includes('pg_advisory_xact_lock'))<queries.findIndex(x=>x.includes("status='in_service',started_at")));
 assert.equal(queries.at(-1),'COMMIT');
});
test('v95 replay of started ticket has no duplicate audit or write',async()=>{
 const f=fixture({ticket:base('in_service')});const r=await f.send('startService');
 assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);assert.equal(f.events(),0);assert.equal(f.updates(),0);
});
for(const status of ['waiting','served','missed','left']){
 test('v95 cannot start '+status+' ticket',async()=>{
  const f=fixture({ticket:base(status)});const r=await f.send('startService');
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'queue_changed');assert.equal(f.events(),0);
 });
}
for(const bad of [null,0,-1,1.5,'0','01','0x12','1e2','9007199254740992',[],{},'hello']){
 test('v95 refuses malformed start ID '+String(bad),async()=>{
  const f=fixture();const r=await f.send('startService',{id:bad});
  assert.equal(r.statusCode,400);assert.equal(f.calls.length,0);
 });
}
for(const wrong of [undefined,null,0,'waiting','in_service','served',{},[]]){
 test('v95 start requires explicit called snapshot '+String(wrong),async()=>{
  const f=fixture();const r=await f.send('startService',{body: wrong===undefined?{}:{expected_status:wrong}});
  assert.equal(r.statusCode,400);assert.equal(f.calls.length,0);
 });
}
test('v95 forbids cross-account service start',async()=>{
 const f=fixture();const r=await f.send('startService',{user:{role:'customer',id:5,profileId:7}});
 assert.equal(r.statusCode,403);assert.equal(f.updates(),0);
});
test('v95 rejects inactive barber before queue update',async()=>{
 const f=fixture({authorized:false});const r=await f.send('startService');
 assert.equal(r.statusCode,403);assert.equal(f.updates(),0);
});
test('v95 foreign or missing queue ID is not disclosed',async()=>{
 const f=fixture({ticket:null});const r=await f.send('startService');
 assert.equal(r.statusCode,404);assert.equal(f.updates(),0);
});
test('v95 old-date call cannot begin service',async()=>{
 const f=fixture({changed:false});const r=await f.send('startService');
 assert.equal(r.statusCode,409);assert.equal(f.events(),0);
});
test('v95 in-service ticket blocks next call',async()=>{
 const f=fixture({servicing:base('in_service')});const r=await f.send('callNext',{body:{expected_next_id:18}});
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'service_in_progress');assert.equal(f.updates(),0);
});
test('v95 in-service can finish as served',async()=>{
 const f=fixture({ticket:base('in_service')});const r=await f.send('finish',{body:{status:'served',expected_status:'in_service'}});
 assert.equal(r.statusCode,200);assert.equal(f.events(),1);assert.equal(r.body.entry.status,'served');
});
for(const status of ['missed','left']){
 test('v95 in-service cannot be marked '+status,async()=>{
  const f=fixture({ticket:base('in_service')});const r=await f.send('finish',{body:{status,expected_status:'in_service'}});
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'invalid_transition');assert.equal(f.updates(),0);
 });
}
test('v95 finishing with stale observed called status rejected after start',async()=>{
 const f=fixture({ticket:base('in_service')});const r=await f.send('finish',{body:{status:'served',expected_status:'called'}});
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'queue_changed');assert.equal(f.updates(),0);
});
test('v95 uncertain COMMIT quarantines DB connection and does not claim success',async()=>{
 const f=fixture({commitFail:true});const r=await f.send('startService');
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_result_unknown');assert.deepEqual(f.release(),[true]);
 assert.ok(!JSON.stringify(r.body).includes('network lost'));
});
test('v95 failed write rolls back instead of claiming service started',async()=>{
 const f=fixture({throwOnUpdate:true});const r=await f.send('startService');
 assert.equal(r.statusCode,503);assert.equal(f.calls.at(-1).sql,'ROLLBACK');assert.deepEqual(f.release(),[false]);
});
test('v95 failed rollback quarantines broken connection',async()=>{
 const f=fixture({throwOnUpdate:true,rollbackFail:true});const r=await f.send('startService');
 assert.equal(r.statusCode,503);assert.deepEqual(f.release(),[true]);
});
test('v95 SQL migration is additive to 42 existing versions, no data rewrite',()=>{
 const root=path.resolve(__dirname,'../database');
 const sql=fs.readFileSync(path.join(root,'migrations/20261214_walkin_service_started.sql'),'utf8');
 const plan=fs.readFileSync(path.join(root,'bootstrap.sql'),'utf8');
 assert.match(sql,/status IN \('called','in_service'\)/);
 assert.match(sql,/DROP CONSTRAINT walkin_queue_state_dates/);
 assert.match(sql,/INSERT INTO ustara_schema_migrations\(version\)/);
 assert.doesNotMatch(sql,/\b(?:DELETE FROM|UPDATE walkin_queue SET)\b/);
 assert.match(plan,/20261214_walkin_service_started\.sql/);
});
