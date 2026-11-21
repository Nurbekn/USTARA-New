'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTelegramApi,TelegramApiError}=require('../telegram/api');
const {telegramRetryDelay,MAX_AUTOMATIC_DELAY_SECONDS,readTelegramRetryAfter}=require('../services/telegramRetryPolicy');
const {createQueueTelegramDispatcher}=require('../services/queueTelegramNotifications');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const rows=v=>({rowCount:v.length,rows:v});
function fakePool(kind,attempts=2){
 const calls=[];
 const pool={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(kind==='queue'&&sql.includes('RETURNING o.id,o.entry_id,o.chat_id,o.attempts'))
   return rows([{id:9,entry_id:42,chat_id:'100',attempts}]);
  if(kind==='smart'&&sql.includes('RETURNING t.id,t.offer_id,t.chat_id,t.attempts'))
   return rows([{id:11,offer_id:55,chat_id:'100',attempts}]);
  if(kind==='queue'&&sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows([{ok:1}]);
  if(kind==='smart'&&sql.includes('SELECT f.expires_at,o.start_at'))return rows([{start_at:new Date()}]);
  return rows([]);
 }};
 const update=()=>calls.find(x=>x.sql.includes('SET status=$3,')&&x.sql.includes('next_attempt_at='))
  ||calls.find(x=>x.sql.includes('SET status=$3,next_attempt_at='));
 return {pool,calls,update};
}
test('v43 Telegram 429 HTTP response preserves legitimate 2 hour retry_after',async()=>{
 const api=createTelegramApi('123:'+ 'x'.repeat(30),async()=>({ok:false,status:429,json:async()=>({ok:false,error_code:429,parameters:{retry_after:7200}})}));
 await assert.rejects(api('sendMessage',{chat_id:'100'}),e=>e.code===429&&e.retryAfter===7200);
 assert.equal(readTelegramRetryAfter(MAX_AUTOMATIC_DELAY_SECONDS+100),MAX_AUTOMATIC_DELAY_SECONDS+1);
});
test('v43 retry policy honors Telegram cooldown and rejects overlong/unsafe automatic retry',()=>{
 assert.equal(telegramRetryDelay(1,7200),7200);
 assert.equal(telegramRetryDelay(3,120.1),121);
 assert.equal(telegramRetryDelay(3,0),20);
 assert.equal(telegramRetryDelay(3,MAX_AUTOMATIC_DELAY_SECONDS+1),null);
 assert.equal(telegramRetryDelay(1,Infinity),null);
 assert.equal(telegramRetryDelay(0,30),null);
});
for(const kind of ['queue','smart']){
 test(`v43 ${kind} worker honors two hour 429 without premature replay`,async()=>{
  const f=fakePool(kind);
  const api=async()=>{throw new TelegramApiError(429,7200);};
  const worker=kind==='queue'?createQueueTelegramDispatcher({pool:f.pool,api}):createSmartBookingTelegram({pool:f.pool,api});
  assert.equal(await worker.step(),true);
  const update=f.update();assert.ok(update);
  assert.equal(update.args[2],'pending');assert.equal(update.args[3],7200);
 });
 test(`v43 ${kind} worker escalates >30-day 429 rather than retrying early`,async()=>{
  const f=fakePool(kind);
  const worker=kind==='queue'?createQueueTelegramDispatcher({pool:f.pool,api:async()=>{throw new TelegramApiError(429,MAX_AUTOMATIC_DELAY_SECONDS+50);}})
   :createSmartBookingTelegram({pool:f.pool,api:async()=>{throw new TelegramApiError(429,MAX_AUTOMATIC_DELAY_SECONDS+50);}});
  assert.equal(await worker.step(),true);
  const update=f.update();assert.equal(update.args[2],'failed');assert.equal(update.args[3],0);
 });
}
