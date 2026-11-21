'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const rows=v=>({rows:v,rowCount:v.length});
function fixture(response){
 const calls=[],pool={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('RETURNING t.id,t.offer_id,t.chat_id,t.attempts'))return rows([{id:10,offer_id:77,chat_id:'250',attempts:1}]);
  if(sql.includes('SELECT f.expires_at,o.start_at'))return rows([{expires_at:new Date(Date.now()+300000),start_at:new Date(Date.now()+3600000)}]);
  return rows([]);
 }};
 return {calls,worker:createSmartBookingTelegram({pool,api:async()=>response})};
}
test('v38 exhausted pending Telegram attempts are terminally failed before claim',async()=>{
 const f=fixture({message_id:10,chat:{id:'250'}});
 await f.worker.claim();
 const q=f.calls.find(x=>x.sql.includes("status='pending' AND attempts>=5"));
 assert.ok(q);assert.match(q.sql,/status='failed'/);
 assert.ok(f.calls.indexOf(q)<f.calls.findIndex(x=>x.sql.includes('FOR UPDATE OF t SKIP LOCKED')));
});
test('v38 malformed injected Telegram response cannot be ACKed sent',async()=>{
 for(const bad of [null,{}, {message_id:0,chat:{id:250}}, {message_id:44,chat:{id:999}}, {message_id:44}]){
  const f=fixture(bad);
  assert.equal(await f.worker.step(),true);
  assert.ok(f.calls.some(x=>x.args.includes('uncertain')));
  assert.ok(!f.calls.some(x=>x.sql.includes("status='sent',sent_at=")));
 }
});
test('v38 valid injected Telegram response is accepted only for correct private chat',async()=>{
 const f=fixture({message_id:123,chat:{id:250}});
 assert.equal(await f.worker.step(),true);
 const ack=f.calls.find(x=>x.sql.includes("status='sent',sent_at="));
 assert.ok(ack);assert.deepEqual(ack.args.slice(-1),[123]);
});
