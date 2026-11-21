'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueueTelegramService}=require('../services/queueTelegramNotifications');
const rows=list=>({rows:list,rowCount:list.length});
const qr='a'.repeat(48),receipt='b'.repeat(32),invite='c'.repeat(48);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function mock({ticket={id:11,status:'waiting',queue_date:today()},inviteRow,linked=[],existing=[]}={}){
 const calls=[];
 const c={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('JOIN walkin_qr_tokens t ON t.id=r.qr_token_id')&&sql.includes('FOR UPDATE OF q'))return rows(ticket?[ticket]:[]);
  if(sql.includes('SELECT (created_at>clock_timestamp()'))return rows(existing);
  if(sql.includes('FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1'))return rows(linked);
  if(sql.includes('JOIN walkin_queue q ON q.id=i.entry_id'))return rows(inviteRow?[inviteRow]:[]);
  if(sql.includes('DELETE FROM walkin_queue_telegram_subscriptions WHERE chat_id'))return rows([{entry_id:11}]);
  return rows([]);
 },release(){}};
 return {calls,pool:{connect:async()=>c}};
}
test('v40 Telegram invite consumption is fenced by the PostgreSQL clock and local queue date',async()=>{
 const f=mock({inviteRow:{entry_id:11,expires_at:new Date(Date.now()+90000),consumed_at:null,status:'waiting',queue_date:today()}});
 await createQueueTelegramService({pool:f.pool}).consume(invite,123456);
 const read=f.calls.find(x=>x.sql.includes('JOIN walkin_queue q ON q.id=i.entry_id'));
 assert.ok(read);
 assert.match(read.sql,/i.expires_at>clock_timestamp\(\)/);
 assert.match(read.sql,/i.consumed_at IS NULL/);
 assert.match(read.sql,/q.status='waiting'/);
 assert.match(read.sql,/AT TIME ZONE 'Asia\/Tashkent'/);
 assert.ok(f.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue_telegram_subscriptions')));
});
test('v40 rate limiting uses DB time, not an out-of-sync Node clock',async()=>{
 const f=mock({existing:[{rate_limited:true}]});
 const service=createQueueTelegramService({pool:f.pool,env:{TELEGRAM_BOT_USERNAME:'UstaraTestBot'}});
 await assert.rejects(service.issue(qr,receipt),{status:429,code:'invite_rate_limit'});
 const query=f.calls.find(x=>x.sql.includes('AS rate_limited'));
 assert.ok(query);assert.match(query.sql,/clock_timestamp\(\)-interval '1 minute'/);
 assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue_telegram_invites')));
});
test('v40 /stopqueue locks queue before deleting subscription to serialize with opt-in',async()=>{
 const f=mock();
 await createQueueTelegramService({pool:f.pool}).stopChat(123456);
 const lock=f.calls.findIndex(x=>x.sql.includes('FOR UPDATE OF q')&&x.sql.includes('s.chat_id=$1'));
 const del=f.calls.findIndex(x=>x.sql.includes('DELETE FROM walkin_queue_telegram_subscriptions WHERE chat_id'));
 assert.ok(lock>=0&&del>lock);
 assert.deepEqual(f.calls[lock].args,['123456']);
 assert.ok(f.calls.some(x=>x.sql.includes("status='cancelled'")));
});
