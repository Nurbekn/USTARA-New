'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createQueueTelegramService}=require('../services/queueTelegramNotifications');
const raw='a'.repeat(48),receipt='b'.repeat(32);
const rows=items=>({rows:items,rowCount:items.length});
function mock({linked=true,status='waiting',proofLive=true}={}){
 const calls=[];
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tashkent',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const client={query:async(sql,args=[])=>{
  calls.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('JOIN walkin_qr_tokens t'))
   return rows(sql.includes('FOR SHARE OF r')&&!proofLive?[]:[{id:7,barber_id:3,status,queue_date:today}]);
  if(sql.includes('SELECT status,queue_date FROM walkin_queue'))return rows([{status,queue_date:today}]);
  if(sql.includes('UPDATE walkin_queue_telegram_subscriptions'))return rows(linked?[{entry_id:7}]:[]);
  return rows([]);
 },release(){}};
 return {pool:{connect:async()=>client},calls};
}
test('v27 offer notifications require an explicit separate boolean, never default to v25 call consent',async()=>{
 const f=mock(),svc=createQueueTelegramService({pool:f.pool});
 await assert.rejects(svc.offerConsent(raw,receipt,'yes'),{status:400});
 assert.equal(f.calls.length,0);
 assert.deepEqual(await svc.offerConsent(raw,receipt,true),{offers_enabled:true});
 assert.ok(f.calls.some(x=>x.sql.includes('offers_consent_at=CASE WHEN')));
 assert.equal(f.calls.some(x=>JSON.stringify(x.args).includes(raw)||JSON.stringify(x.args).includes(receipt)),false);
});
test('v27 no Telegram subscription means no offer consent; after opt-out queued unsent messages cancel',async()=>{
 const absent=mock({linked:false});
 await assert.rejects(createQueueTelegramService({pool:absent.pool}).offerConsent(raw,receipt,true),{status:409});
 const f=mock();const res=await createQueueTelegramService({pool:f.pool}).offerConsent(raw,receipt,false);
 assert.deepEqual(res,{offers_enabled:false});
 assert.ok(f.calls.some(x=>x.sql.includes("status='cancelled'")&&x.sql.includes('smart_booking_telegram_outbox')));
});
test('v27 stopped queue cannot enable offer delivery even with previously valid QR proof',async()=>{
 const f=mock({status:'called'});
 await assert.rejects(createQueueTelegramService({pool:f.pool}).offerConsent(raw,receipt,true),{status:409});
 assert.ok(!f.calls.some(x=>x.sql.includes('UPDATE walkin_queue_telegram_subscriptions')));
});

test('v31 offer consent is not restored after QR approval revoked while waiting for lock',async()=>{
 const f=mock({proofLive:false});
 await assert.rejects(createQueueTelegramService({pool:f.pool}).offerConsent(raw,receipt,true),
  {status:403,code:'ticket_revoked'});
 const locked=f.calls.findIndex(q=>q.sql.includes('SELECT status,queue_date FROM walkin_queue'));
 const proof=f.calls.findIndex(q=>q.sql.includes('FOR SHARE OF r'));
 assert.ok(locked>=0&&proof>locked);
 assert.ok(!f.calls.some(q=>q.sql.includes('UPDATE walkin_queue_telegram_subscriptions')));
 assert.equal(f.calls.at(-1).sql,'ROLLBACK');
});
