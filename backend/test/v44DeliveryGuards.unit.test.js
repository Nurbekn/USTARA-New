'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTelegramApi}=require('../telegram/api');
const {readTelegramRetryAfter,telegramRetryDelay,MAX_AUTOMATIC_DELAY_SECONDS}=require('../services/telegramRetryPolicy');
const {SQL,summarize}=require('../scripts/v41-telegram-delivery-health');
const {parseTapSummary,runVerifiedTest}=require('../scripts/v40-staging');
const full=n=>`TAP version 13\n${Array.from({length:n},(_,i)=>`ok ${i+1} - test ${i+1}`).join('\n')}\n1..${n}\n# tests ${n}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0`;

test('v44: explicitly malformed Telegram retry_after fails closed rather than becoming five seconds',async()=>{
 const bad=[-10,0,'7200',NaN,Infinity,{},true];
 for(const value of bad){
  const cooldown=readTelegramRetryAfter(value);
  assert.equal(telegramRetryDelay(1,cooldown),null);
 }
 assert.equal(readTelegramRetryAfter(undefined),5); // absent cooldown uses conservative bounded retry
 assert.equal(readTelegramRetryAfter(7200),7200);
 assert.equal(readTelegramRetryAfter(MAX_AUTOMATIC_DELAY_SECONDS+5),MAX_AUTOMATIC_DELAY_SECONDS+1);
 const api=createTelegramApi('123:'+'x'.repeat(30),async()=>({ok:false,status:429,json:async()=>({ok:false,error_code:429,parameters:{retry_after:'7200'}})}));
 await assert.rejects(api('sendMessage',{chat_id:'100'}),e=>e.code===429&&telegramRetryDelay(1,e.retryAfter)===null);
});
test('v44: monitoring refuses repeated status aggregate to avoid undercounting',()=>{
 const row={channel:'queue',status:'uncertain',total:2,due:0,stale_lease:0};
 assert.throws(()=>summarize([row,row]),/Duplicate/);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|chat_id|token_hash)\b/i);
});
test('v44: staging needs every TAP count, even when process reports success',()=>{
 assert.equal(parseTapSummary(full(4)).tests,4);
 for(const output of ['# tests 2\n# pass 2', '# tests 3\n# pass 3\n# fail 0\n# skipped 0',
  full(2).replace('# skipped 0','# skipped 1'), full(2)+'\n# pass 2']){
  assert.throws(()=>parseTapSummary(output),/NOT PASS/);
 }
});
test('v44: staging rejects incomplete TAP output from a green subprocess',()=>{
 const fake=()=>({stdout:'# tests 1\n# pass 1',status:0,signal:null});
 assert.throws(()=>runVerifiedTest({file:'dummy.test.js',backend:'/tmp',env:{},spawn:fake}),/NOT PASS/);
});
for(const channel of ['queue','smart_booking']){
 test(`v44: ${channel} worker does not replay malformed Telegram 429 cooldown`,async()=>{
  const {TelegramApiError}=require('../telegram/api');
  const {createQueueTelegramDispatcher}=require('../services/queueTelegramNotifications');
  const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
  const calls=[];
  const rows=value=>({rowCount:value.length,rows:value});
  const pool={query:async(sql,args=[])=>{
   calls.push({sql,args});
   if(channel==='queue'&&sql.includes('RETURNING o.id,o.entry_id,o.chat_id,o.attempts'))
    return rows([{id:101,entry_id:55,chat_id:'200',attempts:1}]);
   if(channel==='smart_booking'&&sql.includes('RETURNING t.id,t.offer_id,t.chat_id,t.attempts'))
    return rows([{id:102,offer_id:44,chat_id:'200',attempts:1}]);
   if(channel==='queue'&&sql.includes('SELECT 1 FROM walkin_queue_notification_outbox o'))return rows([{ok:1}]);
   if(channel==='smart_booking'&&sql.includes('SELECT f.expires_at,o.start_at'))return rows([{start_at:new Date()}]);
   return rows([]);
  }};
  const api=async()=>{throw new TelegramApiError(429,readTelegramRetryAfter('bogus'));};
  const worker=channel==='queue'?createQueueTelegramDispatcher({pool,api}):createSmartBookingTelegram({pool,api});
  assert.equal(await worker.step(),true);
  const final=calls.find(c=>c.sql.includes('next_attempt_at=')&&c.sql.includes('SET status=$3'));
  assert.ok(final);
  assert.equal(final.args[2],'failed');
  assert.equal(final.args[3],0);
 });
}
