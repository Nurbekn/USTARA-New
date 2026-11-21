'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const dbPath=require.resolve('../db'),previous=require.cache[dbPath];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
if(previous)require.cache[dbPath]=previous;else delete require.cache[dbPath];
const ts='2026-11-19T14:05:00.000Z';
const ticket=(status='called',more={})=>({id:17,barber_id:7,request_key:'a'.repeat(32),
 display_label:'Guest',queue_date:'2026-11-19',queue_position:1,created_at:ts,
 called_at:ts,arrived_at:['arrived','in_service'].includes(status)?ts:null,
 started_at:status==='in_service'?ts:null,finished_at:null,status,...more});
const rows=list=>({rows:list,rowCount:list.length});
function harness({record=ticket(),authorized=true,changed=true,commitFail=false,writeFail=false,rollbackFail=false,
 arrivedHead=null,servicing=null}={}){
 const calls=[],released=[];let writes=0,audits=0,notices=0;
 const database={async connect(){return {
   async query(sql,args=[]){calls.push({sql,args});
    if(sql==='COMMIT'&&commitFail)throw Error('network error during COMMIT');
    if(sql==='ROLLBACK'&&rollbackFail)throw Error('rollback failed');
    if(sql.includes('SELECT b.id FROM barbers'))return rows(authorized?[{id:7}]:[]);
    if(sql.includes("AND status='called' FOR UPDATE"))return rows([]);
    if(sql.includes("AND status='arrived' FOR UPDATE"))return rows(arrivedHead?[arrivedHead]:[]);
    if(sql.includes("AND status='in_service' FOR UPDATE"))return rows(servicing?[servicing]:[]);
    if(sql.includes('AND id=$2 FOR UPDATE'))return rows(record?[record]:[]);
    if(sql.startsWith("UPDATE walkin_queue SET status='arrived'")){
      if(writeFail)throw Error('write failed');writes++;return rows(changed?[ticket('arrived')]:[]);
    }
    if(sql.startsWith("UPDATE walkin_queue SET status='in_service'")){
      if(writeFail)throw Error('write failed');writes++;return rows(changed?[ticket('in_service')]:[]);
    }
    if(sql.startsWith('UPDATE walkin_queue SET status=$1')){
      if(writeFail)throw Error('write failed');writes++;return rows(changed?[ticket(args[0])]:[]);
    }
    if(sql.includes('INSERT INTO walkin_queue_events'))audits++;
    if(sql.includes('UPDATE walkin_queue_notification_outbox'))notices++;
    return rows([]);
   },release(broken){released.push(broken===true)}
 }}},api=createHandlers(database);
 async function send(method,{id='17',body={expected_status:'called'},user={role:'barber',id:11,profileId:7}}={}){
  const res={statusCode:200,body:null,headers:{},set(k,v){this.headers[k]=v;return this},
   status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
  await api[method]({params:{id},user,body},res);return res;
 }
 return {send,calls,released,writes:()=>writes,audits:()=>audits,notices:()=>notices};
}
test('v96 called -> arrived records one timestamp, audit, pending notice cancel under shared mutex',async()=>{
 const h=harness();const r=await h.send('markArrived');
 assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'arrived');
 assert.equal(r.body.entry.arrived_at,ts);assert.equal(r.body.entry.called_at,ts);
 assert.equal('request_key' in r.body.entry,false);assert.equal(r.body.replayed,false);
 assert.deepEqual([h.writes(),h.audits(),h.notices()],[1,1,1]);
 assert.equal(r.headers['Cache-Control'],'no-store');assert.deepEqual(h.released,[false]);
 const queries=h.calls.map(c=>c.sql);
 assert.ok(queries.findIndex(s=>s.includes('pg_advisory_xact_lock')) < queries.findIndex(s=>s.includes("status='arrived',arrived_at")));
 assert.equal(queries.at(-1),'COMMIT');
});
test('v96 repeated arrived request replays with no write, audit or telegram duplicate',async()=>{
 const h=harness({record:ticket('arrived')});const r=await h.send('markArrived');
 assert.equal(r.statusCode,200);assert.equal(r.body.replayed,true);
 assert.deepEqual([h.writes(),h.audits(),h.notices()],[0,0,0]);
});
for(const status of ['waiting','in_service','served','missed','left']){
 test('v96 cannot mark '+status+' as newly arrived',async()=>{
  const h=harness({record:ticket(status)}),r=await h.send('markArrived');
  assert.equal(r.statusCode,409);assert.equal(r.body.code,'queue_changed');assert.equal(h.writes(),0);
 });
}
for(const bad of [null,0,-1,1.1,'0','01','0x10','1e2','9007199254740992',[],{},'hi']){
 test('v96 arrival rejects malformed ticket ID '+String(bad),async()=>{
  const h=harness(),r=await h.send('markArrived',{id:bad});
  assert.equal(r.statusCode,400);assert.equal(h.calls.length,0);
 });
}
for(const bad of [undefined,null,'arrived','waiting','in_service','served',0,[]]){
 test('v96 arrival requires observed called state '+String(bad),async()=>{
  const h=harness(),r=await h.send('markArrived',{body:bad===undefined?{}:{expected_status:bad}});
  assert.equal(r.statusCode,400);assert.equal(h.calls.length,0);
 });
}
test('v96 arrival requires barber permission and active approved account',async()=>{
 const h=harness(),unauth=await h.send('markArrived',{user:{role:'customer',id:1,profileId:7}});
 assert.equal(unauth.statusCode,403);assert.equal(h.calls.length,0);
 const h2=harness({authorized:false}),inactive=await h2.send('markArrived');
 assert.equal(inactive.statusCode,403);assert.equal(h2.writes(),0);
});
test('v96 another barber ticket is not revealed',async()=>{
 const h=harness({record:null}),r=await h.send('markArrived');
 assert.equal(r.statusCode,404);assert.equal(h.writes(),0);
});
test('v96 cannot arrive on stale date',async()=>{
 const h=harness({changed:false}),r=await h.send('markArrived');
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'queue_changed');assert.equal(h.audits(),0);
});
test('v96 already arrived blocks call-next for a different waiting ticket',async()=>{
 const h=harness({arrivedHead:ticket('arrived')}),r=await h.send('callNext',{body:{expected_next_id:42}});
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'customer_arrived');assert.equal(h.writes(),0);
});
test('v96 arrival permits start of service with matching arrived precondition',async()=>{
 const h=harness({record:ticket('arrived')}),r=await h.send('startService',{body:{expected_status:'arrived'}});
 assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'in_service');assert.equal(h.audits(),1);
 assert.ok(h.calls.some(x=>x.sql.includes("status=$3")&&x.args[2]==='arrived'));
});
test('v96 preserves legacy call -> start transition for older clients',async()=>{
 const h=harness(),r=await h.send('startService',{body:{expected_status:'called'}});
 assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'in_service');
});
test('v96 does not start service against stale observed state',async()=>{
 const h=harness({record:ticket('arrived')}),r=await h.send('startService',{body:{expected_status:'called'}});
 assert.equal(r.statusCode,409);assert.equal(h.writes(),0);
});
test('v96 arrived ticket may leave but not be marked missed or served before start',async()=>{
 for(const status of ['missed','served']){
  const h=harness({record:ticket('arrived')}),r=await h.send('finish',{body:{status,expected_status:'arrived'}});
  assert.equal(r.statusCode,409);assert.equal(h.writes(),0);
 }
 const h=harness({record:ticket('arrived')}),r=await h.send('finish',{body:{status:'left',expected_status:'arrived'}});
 assert.equal(r.statusCode,200);assert.equal(r.body.entry.status,'left');
});
test('v96 uncertain COMMIT response quarantines DB connection and does not claim success',async()=>{
 const h=harness({commitFail:true}),r=await h.send('markArrived');
 assert.equal(r.statusCode,503);assert.equal(r.body.code,'queue_result_unknown');
 assert.deepEqual(h.released,[true]);assert.equal(JSON.stringify(r.body).includes('network error'),false);
});
test('v96 failed write rolls back; failed rollback quarantines connection',async()=>{
 let h=harness({writeFail:true}),r=await h.send('markArrived');
 assert.equal(r.statusCode,503);assert.equal(h.calls.at(-1).sql,'ROLLBACK');assert.deepEqual(h.released,[false]);
 h=harness({writeFail:true,rollbackFail:true});r=await h.send('markArrived');
 assert.equal(r.statusCode,503);assert.deepEqual(h.released,[true]);
});
test('v96 schema is additive and does not mutate historical queue rows',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../database/migrations/20261215_walkin_arrived.sql'),'utf8');
 const plan=fs.readFileSync(path.resolve(__dirname,'../database/bootstrap.sql'),'utf8');
 assert.match(sql,/ADD COLUMN arrived_at TIMESTAMPTZ/);
 assert.match(sql,/status IN \('called','arrived','in_service'\)/);
 assert.match(sql,/action IN \('joined','called','arrived','started'/);
 assert.doesNotMatch(sql,/\bDELETE FROM\b|\bUPDATE walkin_queue SET\b/);
 assert.match(plan,/20261214_walkin_service_started\.sql[\s\S]*20261215_walkin_arrived\.sql/);
});
