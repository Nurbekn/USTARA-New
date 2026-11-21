'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueueSelfExit}=require('../services/queueSelfExit');
const qrToken='a'.repeat(48),requestId='b'.repeat(32);
const user={role:'customer',profileId:13,accountId:15};
const rows=value=>({rows:value,rowCount:value.length});
function fakeDb({status='arrived',today=true,owner=true,qrProof=true,manualProof=true}={}){
 const queries=[],released=[];
 const client={async query(sql,args=[]){
  queries.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('JOIN walkin_queue q'))
   return rows(owner?[{entry_id:9,barber_id:7}]:[]);
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t')&&sql.includes('FOR SHARE OF r'))
   return rows(qrProof?[{one:1}]:[]);
  if(sql.includes('FROM customers c JOIN users u'))return rows([{id:13}]);
  if(sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q')&&sql.includes('SELECT q.id,q.barber_id'))
   return rows(owner?[{id:9,barber_id:7}]:[]);
  if(sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q')&&sql.includes('FOR SHARE OF m,q'))
   return rows(manualProof?[{one:1}]:[]);
  if(sql.includes('SELECT id,status,queue_date FROM walkin_queue'))return rows([{id:9,status,queue_date:'2026-11-19'}]);
  if(sql.includes(' AS today'))return rows([{today}]);
  return rows([]);
 },release(broken){released.push(broken===true)}};
 return {db:{connect:async()=>client},queries,released};
}
for(const route of ['qr','manual']){
 const call=(fixture)=>route==='qr'
  ?createQueueSelfExit(fixture.db).leaveQr({token:qrToken,request_id:requestId})
  :createQueueSelfExit(fixture.db).leaveManual({entry_id:9,actor:user});
 for(const status of ['waiting','called','arrived']){
  test(`v97 ${route} can leave ${status} before service start with one audited transition`,async()=>{
   const f=fakeDb({status});const result=await call(f);
   assert.deepEqual(result,{left:true,replayed:false});
   const updates=f.queries.filter(q=>q.sql.includes("UPDATE walkin_queue SET status='left'"));
   assert.equal(updates.length,1);
   assert.match(updates[0].sql,/status IN \('waiting','called','arrived'\)/);
   assert.equal(f.queries.filter(q=>q.sql.includes('INSERT INTO walkin_queue_events')).length,1);
   assert.equal(f.queries.at(-1).sql,'COMMIT');
   assert.deepEqual(f.released,[false]);
  });
 }
 for(const status of ['in_service','served','missed']){
  test(`v97 ${route} refuses exit of ${status}`,async()=>{
   const f=fakeDb({status});await assert.rejects(call(f),{status:409});
   assert.equal(f.queries.some(q=>q.sql.includes("UPDATE walkin_queue SET status='left'")),false);
   assert.equal(f.queries.at(-1).sql,'ROLLBACK');
  });
 }
 test(`v97 ${route} arrived ticket from earlier day cannot leave`,async()=>{
  const f=fakeDb({status:'arrived',today:false});await assert.rejects(call(f),{status:410});
  assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO walkin_queue_events')),false);
 });
 test(`v97 ${route} replay left does not emit another audit`,async()=>{
  const f=fakeDb({status:'left'});assert.deepEqual(await call(f),{left:true,replayed:true});
  assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO walkin_queue_events')),false);
 });
}
test('v97 QR proof recheck is required before arrived self exit',async()=>{
 const f=fakeDb({qrProof:false});await assert.rejects(
  createQueueSelfExit(f.db).leaveQr({token:qrToken,request_id:requestId}),{status:403});
 assert.equal(f.queries.some(q=>q.sql.includes("UPDATE walkin_queue SET status='left'")),false);
});
test('v97 manual consent recheck is required before arrived self exit',async()=>{
 const f=fakeDb({manualProof:false});await assert.rejects(
  createQueueSelfExit(f.db).leaveManual({entry_id:9,actor:user}),{status:403});
 assert.equal(f.queries.some(q=>q.sql.includes("UPDATE walkin_queue SET status='left'")),false);
});
