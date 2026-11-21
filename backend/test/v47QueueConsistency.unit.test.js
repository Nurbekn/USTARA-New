'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQueueController');
const {createQueueSelfExit}=require('../services/queueSelfExit');
const {cleanupTerminalQueue}=require('../services/queueOfferLifecycle');
const {pollingRetryDelaySeconds,pauseAfterTelegramError}=require('../telegram/pollingRetry');
const {createTelegramApi}=require('../telegram/api');
const {telegramRetryDelay}=require('../services/telegramRetryPolicy');
const rows=a=>({rows:a,rowCount:a.length});
const actor={role:'barber',id:17,profileId:7};
const ticket={id:11,barber_id:7,queue_date:'2026-11-19',status:'served',display_label:'Mijoz'};
function queueFixture({authorized=true,errorOnActive=false,finished=true}={}){
 const calls=[],releases=[];
 const c={async query(q,args=[]){calls.push({q,args});
   if(q.includes('SELECT b.id FROM barbers'))return rows(authorized?[{id:7}]:[]);
   if(errorOnActive&&q.includes('FROM walkin_queue WHERE barber_id'))throw new Error('query failed');
   if(q.includes('AND id=$2 FOR UPDATE'))return rows(finished?[ticket]:[]);
   if(q.startsWith('UPDATE smart_booking_offers f'))return rows([]);
   return rows([]);
 },release(broken){releases.push(broken);}};
 const db={connect:async()=>c};
 const h=createHandlers(db);
 async function call(method,body={},params={}){
  const state={status:200,headers:{}};
  const res={status(x){state.status=x;return this;},set(k,v){state.headers[k]=v;return this;},json(x){state.body=x;return this;}};
  await h[method]({user:actor,body,params},res);
  return state;
 }
 return {calls,releases,call};
}

test('v47 private GET holds identity share lock through both reads and COMMIT',async()=>{
 const f=queueFixture();const r=await f.call('list');
 assert.equal(r.status,200);assert.equal(r.headers['Cache-Control'],'no-store');
 const qs=f.calls.map(x=>x.q);
 assert.equal(qs[0],'BEGIN ISOLATION LEVEL REPEATABLE READ');
 assert.ok(qs[3].includes('b.user_id=$2')&&qs[3].includes('FOR SHARE OF b,u'));
 assert.deepEqual(f.calls[3].args,[7,17]);
 assert.match(qs[4],/status IN \('waiting','called','arrived','in_service'\)/);
 assert.match(qs[5],/status IN \('served','missed','left'\)/);
 assert.equal(qs.at(-1),'COMMIT');assert.deepEqual(f.releases,[false]);
});
test('v47 private GET cannot read on inactive/wrong barber identity and rolls back',async()=>{
 const f=queueFixture({authorized:false});const r=await f.call('list');
 assert.equal(r.status,403);assert.equal(r.body.code,'barber_unavailable');
 assert.equal(f.calls.at(-1).q,'ROLLBACK');
 assert.equal(f.calls.some(x=>x.q.includes('FROM walkin_queue WHERE barber_id')),false);
 assert.deepEqual(f.releases,[false]);
});
test('v47 private GET query failure rolls back and hides database internals',async()=>{
 const f=queueFixture({errorOnActive:true});const r=await f.call('list');
 assert.equal(r.status,503);assert.equal(r.body.code,'queue_unavailable');
 assert.equal(f.calls.at(-1).q,'ROLLBACK');assert.deepEqual(f.releases,[false]);
});
test('v47 barber finish replay repairs pending notices but not queue status or audit',async()=>{
 const f=queueFixture();const r=await f.call('finish',{status:'served'},{id:11});
 assert.equal(r.status,200);assert.equal(r.body.replayed,true);
 assert.ok(f.calls.some(x=>x.q.includes('UPDATE walkin_queue_notification_outbox')));
 assert.ok(f.calls.some(x=>x.q.includes('DELETE FROM walkin_queue_telegram_invites')));
 assert.equal(f.calls.some(x=>x.q.startsWith('INSERT INTO walkin_queue_events')),false);
 assert.equal(f.calls.some(x=>x.q.startsWith('UPDATE walkin_queue SET')),false);
 assert.equal(f.calls.at(-1).q,'COMMIT');
});
test('v47 shared terminal cleanup never cancels confirmed appointment, deduplicates openings',async()=>{
 const calls=[];const c={query:async(q,args=[])=>{
  calls.push({q,args});
  if(q.startsWith('UPDATE smart_booking_offers f'))return rows([{id:1,opening_id:8},{id:2,opening_id:8}]);
  return rows([]);
 }};
 assert.deepEqual(await cleanupTerminalQueue(c,11),{cancelled_offers:2});
 assert.match(calls[0].q,/NOT EXISTS\(SELECT 1 FROM smart_booking_confirmations/);
 assert.deepEqual(calls[1].args,[[8]]);
 assert.deepEqual(calls[2].args,[[1,2]]);
 assert.equal(calls.filter(x=>x.q.includes('DELETE FROM bookings')).length,0);
 assert.equal(calls.filter(x=>x.q.includes('walkin_queue_notification_outbox')).length,1);
});
function selfExitFixture({status='left',valid=true}={}){
 const calls=[];
 const c={async query(q,args=[]){calls.push({q,args});
  if(q.includes('FROM walkin_qr_requests r')&&q.includes('JOIN walkin_queue q'))return rows([{entry_id:11,barber_id:7}]);
  if(q.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t')&&q.includes('FOR SHARE OF r'))return rows(valid?[{one:1}]:[]);
  if(q.includes('SELECT id,status,queue_date FROM walkin_queue'))return rows([{id:11,status,queue_date:'2026-11-19'}]);
  if(q.includes(' AS today'))return rows([{today:true}]);
  if(q.startsWith('UPDATE smart_booking_offers f'))return rows([]);
  return rows([]);
 },release(){}};
 return {calls,service:createQueueSelfExit({connect:async()=>c})};
}
test('v47 QR exit replay reconciles undelivered notices without duplicate audit',async()=>{
 const f=selfExitFixture();const r=await f.service.leaveQr({token:'a'.repeat(48),request_id:'b'.repeat(32)});
 assert.deepEqual(r,{left:true,replayed:true});
 assert.ok(f.calls.some(x=>x.q.includes('UPDATE walkin_queue_notification_outbox')));
 assert.ok(!f.calls.some(x=>x.q.includes('INSERT INTO walkin_queue_events')));
 assert.ok(!f.calls.some(x=>x.q.includes('DELETE FROM bookings')));
});
test('v47 revoked QR cannot trigger replay reconciliation',async()=>{
 const f=selfExitFixture({valid:false});
 await assert.rejects(f.service.leaveQr({token:'a'.repeat(48),request_id:'b'.repeat(32)}),{status:403});
 assert.equal(f.calls.some(x=>x.q.startsWith('UPDATE')),false);
 assert.equal(f.calls.at(-1).q,'ROLLBACK');
});
test('v47 Telegram 429 duration is never shortened or silently converted to NaN',()=>{
 assert.equal(pollingRetryDelaySeconds({code:429,retryAfter:7200}),7200);
 for(const bad of [0,-1,NaN,Infinity,undefined,'7200',1e20,31*86400])
  assert.equal(pollingRetryDelaySeconds({code:429,retryAfter:bad}),null);
 assert.equal(pollingRetryDelaySeconds({code:'transport',retryAfter:Infinity}),5);
});
test('v47 invalid Telegram retry fails closed, rather than spinning',async()=>{
 await assert.rejects(pauseAfterTelegramError({code:429,retryAfter:0}),{code:'telegram_retry_requires_review'});
 await assert.rejects(pauseAfterTelegramError({code:429,retryAfter:31*86400}),{code:'telegram_retry_requires_review'});
});

test('v47 Telegram HTTP 429 without retry_after never schedules unsafe short replay',async()=>{
 const api=createTelegramApi('123:'+'x'.repeat(30),async()=>({
  ok:false,status:429,json:async()=>({ok:false,error_code:429})
 }));
 await assert.rejects(api('sendMessage',{chat_id:'100'}),e=>{
  assert.equal(Number(e.code),429);
  assert.equal(telegramRetryDelay(1,e.retryAfter),null);
  assert.equal(pollingRetryDelaySeconds(e),null);
  return true;
 });
});
