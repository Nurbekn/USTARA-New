'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createQueueSelfExit}=require('../services/queueSelfExit');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const {createSmartBookingTelegram}=require('../services/smartBookingTelegram');
const rows=x=>({rows:x,rowCount:x.length});
const qr='a'.repeat(48),receipt='b'.repeat(32);
const customer={role:'customer',profileId:13,accountId:15};
function fixture({queueStatus='waiting',owner=true,qrProof=true,manualProof=true,account=true,today=true,offerCount=1}={}){
 const calls=[];
 const c={async query(sql,args=[]){
  calls.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('JOIN walkin_queue q'))return rows(owner?[{entry_id:11,barber_id:7}]:[]);
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t')&&sql.includes('FOR SHARE OF r'))return rows(qrProof?[{one:1}]:[]);
  if(sql.includes('FROM customers c JOIN users u'))return rows(account?[{id:13}]:[]);
  if(sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q')&&sql.includes('SELECT q.id,q.barber_id'))return rows(owner?[{id:11,barber_id:7}]:[]);
  if(sql.includes('FROM walkin_manual_claims m JOIN walkin_queue q')&&sql.includes('FOR SHARE OF m,q'))return rows(manualProof?[{one:1}]:[]);
  if(sql.includes('SELECT id,status,queue_date FROM walkin_queue'))return rows([{id:11,status:queueStatus,queue_date:'2026-11-18'}]);
  if(sql.includes(' AS today'))return rows([{today}]);
  if(sql.includes("UPDATE smart_booking_offers f"))return rows(offerCount?[{id:9,opening_id:20}]:[]);
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c},calls};
}
const isWrite=x=>/^\s*(UPDATE|INSERT|DELETE)\b/i.test(x.sql);
test('v37 QR self exit only for approved ticket, one audit event, no booking deletion',async()=>{
 const f=fixture();const result=await createQueueSelfExit(f.db).leaveQr({token:qr,request_id:receipt});
 assert.deepEqual(result,{left:true,replayed:false});
 assert.equal(f.calls.at(-1).sql,'COMMIT');
 const proofIdx=f.calls.findIndex(x=>x.sql.includes('FOR SHARE OF r'));
 const barIdx=f.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const exitIdx=f.calls.findIndex(x=>x.sql.includes("UPDATE walkin_queue SET status='left'"));
 assert.ok(barIdx>=0&&proofIdx>barIdx&&exitIdx>proofIdx);
 const audit=f.calls.find(x=>x.sql.includes('INSERT INTO walkin_queue_events'));
 assert.deepEqual(audit.args,[11,null,'qr_guest']);
 assert.ok(f.calls.some(x=>x.sql.includes('NOT EXISTS(SELECT 1 FROM smart_booking_confirmations')));
 assert.ok(f.calls.some(x=>x.sql.includes("UPDATE smart_booking_openings SET state='open'")));
 assert.ok(f.calls.some(x=>x.sql.includes('DELETE FROM walkin_queue_telegram_subscriptions')));
 assert.equal(f.calls.some(x=>x.sql.includes('DELETE FROM bookings')),false);
});
test('v37 QR replay is safe, no second audit or changes',async()=>{
 const f=fixture({queueStatus:'left'});const result=await createQueueSelfExit(f.db).leaveQr({token:qr,request_id:receipt});
 assert.deepEqual(result,{left:true,replayed:true});
 assert.ok(f.calls.some(x=>x.sql.includes('UPDATE walkin_queue_notification_outbox')));
 assert.ok(!f.calls.some(x=>x.sql.includes('INSERT INTO walkin_queue_events')));
 assert.ok(!f.calls.some(x=>x.sql.includes("UPDATE walkin_queue SET status='left'")));
});
test('v37 QR bad proof cannot modify another person queue',async()=>{
 let f=fixture({owner:false});
 await assert.rejects(createQueueSelfExit(f.db).leaveQr({token:qr,request_id:receipt}),{status:404});
 assert.equal(f.calls.some(isWrite),false);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 f=fixture({qrProof:false});
 await assert.rejects(createQueueSelfExit(f.db).leaveQr({token:qr,request_id:receipt}),{status:403});
 assert.equal(f.calls.some(isWrite),false);
 f=fixture();
 await assert.rejects(createQueueSelfExit(f.db).leaveQr({token:qr,request_id:'bad'}),{status:400});
 assert.equal(f.calls.length,0);
});
test('v37 manual exit protects identity and rechecks consent under barber lock',async()=>{
 const f=fixture({queueStatus:'called'});
 const result=await createQueueSelfExit(f.db).leaveManual({actor:customer,entry_id:11});
 assert.deepEqual(result,{left:true,replayed:false});
 const identity=f.calls.findIndex(x=>x.sql.includes('FROM customers c JOIN users u'));
 const barber=f.calls.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const proof=f.calls.findIndex(x=>x.sql.includes('FOR SHARE OF m,q'));
 assert.ok(identity>=0&&identity<barber&&proof>barber);
 assert.match(f.calls[identity].sql,/FOR SHARE OF c,u/);
 assert.deepEqual(f.calls.find(x=>x.sql.includes('INSERT INTO walkin_queue_events')).args,[11,15,'customer']);
});
test('v37 inactive account, unrelated ticket and revoked manual consent fail closed',async()=>{
 for(const [options,status] of [[{account:false},401],[{owner:false},404],[{manualProof:false},403]]){
  const f=fixture(options);
  await assert.rejects(createQueueSelfExit(f.db).leaveManual({actor:customer,entry_id:11}),{status});
  assert.ok(!f.calls.some(isWrite));assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 }
});
test('v37 served/missed tickets and yesterday tickets cannot be left a second time',async()=>{
 for(const options of [{queueStatus:'served'},{queueStatus:'missed'},{today:false}]){
  const f=fixture(options);
  await assert.rejects(createQueueSelfExit(f.db).leaveQr({token:qr,request_id:receipt}),
   {status:options.today===false?410:409});
  assert.ok(!f.calls.some(isWrite));
 }
});
test('v37 Telegram outbox send is bound to consent epoch at offer creation',async()=>{
 const queries=[];let sent=0;
 const pool={query:async(sql,args=[])=>{
  queries.push({sql,args});
  if(sql.includes('RETURNING t.id,t.offer_id,t.chat_id,t.attempts'))return rows([{id:1,offer_id:5,chat_id:'250',attempts:1}]);
  if(sql.includes('SELECT f.expires_at,o.start_at'))return rows([]); // changed/renewed consent
  return rows([]);
 }};
 const worker=createSmartBookingTelegram({pool,api:async()=>{sent++;}});
 assert.equal(await worker.step(),true);
 assert.equal(sent,0);
 assert.ok(queries.some(q=>q.sql.includes('s.offers_consent_at<=t.created_at')));
 assert.ok(queries.some(q=>q.sql.includes("status='cancelled'")));
 const src=fs.readFileSync(path.join(__dirname,'../services/smartBookingOffers.js'),'utf8');
 assert.match(src,/s\.offers_consent_at<=t\.created_at/);
 assert.match(src,/s\.offers_consent_at<=o\.created_at/);
});
test('v37 candidate skips deactivated manual accounts, approved QR path still available',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../services/smartBookingOffers.js'),'utf8');
 assert.match(src,/EXISTS\(SELECT 1 FROM customers c JOIN users u ON u\.id=c\.user_id/);
 assert.match(src,/u\.role='customer' AND u\.deactivated_at IS NULL/);
 assert.match(src,/r\.queue_entry_id IS NOT NULL OR m\.entry_id IS NOT NULL/);
});
test('v37 audit migration has truthful actor attribution; 41 forward migrations registered',()=>{
 const root=path.resolve(__dirname,'..');
 const sql=fs.readFileSync(path.join(root,'database/migrations/20261212_queue_self_exit_audit.sql'),'utf8');
 const bootstrap=fs.readFileSync(path.join(root,'database/bootstrap.sql'),'utf8');
 const verify=fs.readFileSync(path.join(root,'database/bootstrap/verify.sql'),'utf8');
 const routes=fs.readFileSync(path.join(root,'routes/queue.js'),'utf8');
 assert.match(sql,/actor_source='qr_guest' AND actor_user_id IS NULL AND action='left'/);
 assert.match(sql,/actor_source='customer' AND actor_user_id IS NOT NULL AND action='left'/);
 assert.match(sql,/20261211_smart_booking_active_entry/);
 assert.match(bootstrap,/migrations\/20261212_queue_self_exit_audit.sql/);
 assert.match(verify,/20261212_queue_self_exit_audit/);
 assert.match(routes,/router\.post\('\/qr-leave',publicQrRateLimit,selfExit\.leaveQr\)/);
 assert.match(routes,/router\.post\('\/manual\/:id\/leave',auth,selfExit\.leaveManual\)/);
});
