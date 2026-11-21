'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createQueueTelegramService,createQueueTelegramDispatcher,nextBackoff,isInvite,digest}=require('../services/queueTelegramNotifications');
const rows=items=>({rows:items,rowCount:items.length});
const raw='a'.repeat(48),receipt='b'.repeat(32),invite='c'.repeat(48);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function mockDb({ticket={id:42,status:'waiting',queue_date:today()},existing=[],linked=[],inviteRow}={}){
 const calls=[];let committed=0;
 const client={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('WHERE t.token_hash=$1 AND r.request_hash=$2') && sql.includes('FOR UPDATE'))return rows(ticket?[ticket]:[]);
  if(sql.includes('FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1'))return rows(linked);
  if(sql.includes('AS rate_limited')&&sql.includes('walkin_queue_telegram_invites'))return rows(existing);
  if(sql.includes('JOIN walkin_queue q ON q.id=i.entry_id')){
   // Real PostgreSQL excludes consumed, expired or no-longer-waiting invites
   // in the WHERE clause. Mirror that DB filtering in this mock.
   const valid=inviteRow && !inviteRow.consumed_at && inviteRow.status==='waiting' &&
    String(inviteRow.queue_date)===today() && new Date(inviteRow.expires_at).getTime()>Date.now();
   return rows(valid?[inviteRow]:[]);
  }
  if(sql.startsWith('DELETE FROM walkin_queue_telegram_subscriptions WHERE chat_id'))return rows([{entry_id:42}]);
  if(sql==='COMMIT')committed++;
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>client},calls,get committed(){return committed}};
}
test('QR holder opt-in uses hash-only one-time link; no raw QR/receipt stored in SQL',async()=>{
 const db=mockDb();const service=createQueueTelegramService({pool:db.db,env:{TELEGRAM_BOT_USERNAME:'UstaraTestBot'}});
 const data=await service.issue(raw,receipt);
 assert.match(data.url,/^https:\/\/t\.me\/UstaraTestBot\?start=qnotify_[a-f0-9]{48}$/);
 assert.equal(data.expires_in_seconds,300);assert.equal(db.committed,1);
 const insert=db.calls.find(c=>c.sql.includes('INSERT INTO walkin_queue_telegram_invites'));
 assert.ok(insert);assert.match(insert.args[1],/^[a-f0-9]{64}$/);
 assert.equal(db.calls.some(c=>JSON.stringify(c.args).includes(raw) || JSON.stringify(c.args).includes(receipt)),false);
 assert.match(insert.sql,/ON CONFLICT\(entry_id\)/);
});
test('linking is denied for forged QR, wrong lifecycle, already-linked, rate-limited tickets',async()=>{
 for(const invalidToken of ['no',null,'X'.repeat(48)]){
  const db=mockDb();const service=createQueueTelegramService({pool:db.db,env:{TELEGRAM_BOT_USERNAME:'UstaraTestBot'}});
  await assert.rejects(service.issue(invalidToken,receipt),{status:400});assert.equal(db.calls.length,0);
 }
 for(const [opts,expected] of [[{ticket:null},409],[{ticket:{id:1,status:'called',queue_date:today()}},409],
  [{linked:[{id:1}]},409],[{existing:[{rate_limited:true}]},429]]){
  const h=mockDb(opts),service=createQueueTelegramService({pool:h.db,env:{TELEGRAM_BOT_USERNAME:'UstaraTestBot'}});
  await assert.rejects(service.issue(raw,receipt),{status:expected});
  assert.equal(h.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue_telegram_invites')),false);
 }
});
test('private-chat subscriber consumes once using only hashed token',async()=>{
 const h=mockDb({inviteRow:{entry_id:42,expires_at:new Date(Date.now()+300000),consumed_at:null,status:'waiting',queue_date:today()}});
 const service=createQueueTelegramService({pool:h.db});
 await service.consume(invite,123456);
 assert.ok(h.calls.some(c=>c.sql.includes('INSERT INTO walkin_queue_telegram_subscriptions')&&c.args[1]==='123456'));
 assert.ok(h.calls.some(c=>c.sql.includes('UPDATE walkin_queue_telegram_invites SET consumed_at')));
 assert.equal(h.calls.some(c=>JSON.stringify(c.args).includes(invite)),false);
 const bad=mockDb({inviteRow:{entry_id:42,expires_at:new Date(Date.now()-1000),consumed_at:null,status:'waiting',queue_date:today()}});
 await assert.rejects(createQueueTelegramService({pool:bad.db}).consume(invite,123456),{status:410});
 assert.equal(bad.calls.some(c=>c.sql.includes('INSERT INTO walkin_queue_telegram_subscriptions')),false);
 await assert.rejects(service.consume('wrong',12345),{status:400});
});
test('ticket holder or /stopqueue opt-out clears pending notices without disclosing chat info',async()=>{
 const h=mockDb();const service=createQueueTelegramService({pool:h.db});
 await service.unlink(raw,receipt);await service.stopChat(123456);
 assert.equal(h.calls.filter(c=>c.sql.includes("status='cancelled'")).length,4);
 assert.equal(h.calls.some(c=>c.sql.includes('DELETE FROM walkin_queue_telegram_invites')),true);
});
test('outbox claim is fenced, skips invalid queue status and never sends to unlinked chat',async()=>{
 const calls=[];
 const db={query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('RETURNING o.id,o.entry_id'))return rows([{id:7,entry_id:42,chat_id:'123456',attempts:1}]);
  if(sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows([]);
  return rows([]);
 }};
 let sent=0;const dispatch=createQueueTelegramDispatcher({pool:db,api:async()=>{sent++;}});
 assert.equal(await dispatch.step(),true);assert.equal(sent,0);
 assert.ok(calls.some(c=>c.sql.includes("status='cancelled'")));
 assert.ok(calls.some(c=>c.sql.includes('FOR UPDATE OF o SKIP LOCKED')));
 assert.ok(calls.some(c=>c.sql.includes('AND o.attempts<6')));
});
test('successful Telegram call ACKs with lease owner and never contains visitor name',async()=>{
 const calls=[];let message;
 const db={query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('RETURNING o.id,o.entry_id'))return rows([{id:7,entry_id:42,chat_id:'123456',attempts:1}]);
  if(sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows([{ok:1}]);
  return rows([]);
 }};
 const dispatch=createQueueTelegramDispatcher({pool:db,api:async(method,body)=>{message=body;return {message_id:77,chat:{id:123456}};}});
 assert.equal(await dispatch.step(),true);assert.equal(message.chat_id,'123456');
 assert.equal(message.protect_content,true);assert.doesNotMatch(message.text,/Mehmon|token|48-char|https:/i);
 const ack=calls.find(c=>c.sql.includes("status='sent'"));
 assert.deepEqual(ack.args[0],7);assert.match(ack.args[1],/^[a-f0-9-]{36}$/);assert.equal(ack.args[2],77);
});
test('retry uses bounded exponential backoff, permanent Telegram error has no retry',async()=>{
 assert.equal(nextBackoff(1),5);assert.equal(nextBackoff(3),20);assert.equal(nextBackoff(6),160);
 assert.equal(nextBackoff(1,17),17);assert.equal(nextBackoff(6,36000),36000);
 const {TelegramApiError}=require('../telegram/api');const calls=[];
 const db={query:async(sql,args=[])=>{calls.push({sql,args});
  if(sql.includes('RETURNING o.id,o.entry_id'))return rows([{id:7,entry_id:42,chat_id:'123456',attempts:2}]);
  if(sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows([{ok:1}]);
  return rows([]);
 }};
 await createQueueTelegramDispatcher({pool:db,api:async()=>{throw new TelegramApiError(403);}}).step();
 assert.equal(calls.find(c=>c.sql.includes('next_attempt_at=clock_timestamp()')).args[2],'failed');
});
test('database migration is last, with one-notice-per-event key and explicit consent tables',()=>{
 const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/20261207_queue_telegram_notifications.sql'),'utf8');
 const bootstrap=fs.readFileSync(path.join(__dirname,'../database/bootstrap.sql'),'utf8');
 assert.match(migration,/CONSTRAINT queue_telegram_event_once UNIQUE\(entry_id,event\)/);
 assert.match(migration,/CREATE TABLE walkin_queue_telegram_subscriptions/);
 assert.ok(bootstrap.indexOf('20261207_queue_telegram_notifications.sql')>bootstrap.indexOf('20261206_queue_order_qr_settings.sql'));
 assert.equal(isInvite('c'.repeat(48)),true);assert.equal(isInvite('X'.repeat(48)),false);
 assert.notEqual(digest(invite),invite);
});
