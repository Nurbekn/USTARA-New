'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createCustomerBookingDispatcher,noticeText}=require('../services/customerBookingTelegramV191');
const root=path.resolve(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

function fakeDb({queued=true,consent=true,eligible=true,ackFailure=false,queryFailure='',unknownCommit=false}={}){
 const calls=[];
 let claim=null, claimState='queued', releases=0, commits=0;
 const row={id:31,booking_id:47,user_id:11,event_kind:'confirmed',expected_status:'confirmed',
   expected_booking_time:'2026-11-22T10:30:00.000Z',
   expected_duration_minutes:40,expected_service_id:19,expected_barber_id:7};
 const query=async(sql,args=[])=>{
  calls.push({sql,args});
  if(queryFailure && sql.includes(queryFailure))throw Error('private DB connection details');
  if(sql==='COMMIT'){
   commits++;
   if(unknownCommit && commits===2)throw Error('Unknown COMMIT acknowledgement');
   return {command:'COMMIT'};
  }
  if(sql.includes("FROM customer_booking_telegram_outbox WHERE status='queued'")){
   return {rowCount:queued&&claimState==='queued'?1:0,rows:queued&&claimState==='queued'?[row]:[]};
  }
  if(sql.includes("SET status='sending',claim_id=$2")){
   claim=args[1];claimState='sending';return {rowCount:1,rows:[]};
  }
  if(sql.includes('SELECT status FROM customer_booking_telegram_outbox')){
   return {rowCount:1,rows:[{status:claimState}]};
  }
  if(sql.includes('FROM bookings b JOIN customers p')){
   return {rowCount:consent&&eligible?1:0,rows:consent&&eligible?[{chat_id:'777'}]:[]};
  }
  if(sql.includes("SET status='cancelled'")){
   claimState='cancelled';return {rowCount:1,rows:[]};
  }
  if(sql.includes('SET status=$3,telegram_message_id=$4')){
   claimState=args[2];return {rowCount:1,rows:[]};
  }
  return {rowCount:0,rows:[]};
 };
 return {pool:{connect:async()=>({query,release(){releases++;}})}, calls,
  get state(){return claimState;},get claim(){return claim;},get releases(){return releases;}};
}
test('v191: no work means no Telegram API call',async()=>{
 const db=fakeDb({queued:false});let sends=0;
 assert.equal(await createCustomerBookingDispatcher({pool:db.pool,api:()=>{sends++;}}).step(),false);
 assert.equal(sends,0);
});
test('v191: accepted means API acknowledgement, not delivery or read',async()=>{
 const db=fakeDb();const sent=[];
 assert.equal(await createCustomerBookingDispatcher({pool:db.pool,api:async(...args)=>{
  sent.push(args);return {message_id:991,chat:{id:777}};
 }}).step(),true);
 assert.equal(db.state,'accepted');assert.equal(sent.length,1);
 assert.equal(sent[0][0],'sendMessage');
 assert.equal(sent[0][1].protect_content,true);
 assert.equal(sent[0][1].chat_id,'777');
 assert.equal(sent[0][1].text,noticeText('confirmed',47));
 assert.doesNotMatch(sent[0][1].text,/password|phone|token|suspension|mijoz ismi/i);
 assert.ok(db.calls.some(q=>q.sql.includes('FOR SHARE OF b,p,u,l')));
 assert.ok(db.calls.some(q=>q.sql.includes("claimed_at<clock_timestamp()-INTERVAL '2 minutes'")));
 assert.equal(db.releases,2);
});
test('v191: revoked consent or stale booking cancels without sending',async()=>{
 for(const opts of [{consent:false},{eligible:false}]){
  const db=fakeDb(opts);let calls=0;
  assert.equal(await createCustomerBookingDispatcher({pool:db.pool,api:async()=>{calls++;}}).step(),true);
  assert.equal(calls,0);assert.equal(db.state,'cancelled');
 }
});
test('v191: transport timeout/malformed ACK become uncertain and cannot be resent',async()=>{
 for(const api of [async()=>{throw Error('telegram token secret');},async()=>({message_id:19,chat:{id:888}})]){
  const db=fakeDb();let sends=0;
  const worker=createCustomerBookingDispatcher({pool:db.pool,api:async(...args)=>{sends++;return api(...args);}});
  assert.equal(await worker.step(),true);assert.equal(db.state,'uncertain');
  assert.equal(await worker.step(),false);assert.equal(sends,1);
 }
});
test('v191: DB final update failure never triggers an immediate replay',async()=>{
 const db=fakeDb({queryFailure:'SET status=$3,telegram_message_id=$4'});let sends=0;
 const worker=createCustomerBookingDispatcher({pool:db.pool,api:async()=>{
  sends++;return {message_id:19,chat:{id:777}};
 }});
 assert.equal(await worker.step(),true);
 assert.equal(db.state,'sending');assert.equal(await worker.step(),false);
 assert.equal(sends,1);
});
test('v191: ambiguous COMMIT after sending leaves a durable claim and never retries',async()=>{
 const db=fakeDb({unknownCommit:true});let sends=0;
 const worker=createCustomerBookingDispatcher({pool:db.pool,api:async()=>{
  sends++;return {message_id:19,chat:{id:777}};
 }});
 assert.equal(await worker.step(),true);assert.equal(sends,1);
 assert.equal(await worker.step(),false);assert.equal(sends,1);
});
test('v191: outgoing text only includes approved event and booking reference',()=>{
 for(const event of ['pending','confirmed','cancelled','rejected','rescheduled']){
  const text=noticeText(event,6);assert.match(text,/USTARA/);
  assert.match(text,/Bron #6/);
 }
 assert.throws(()=>noticeText('password_reset',6));
 assert.throws(()=>noticeText('confirmed','x')); 
});
test('v191: SQL queues only while explicitly opted in and never inherits OTP contacts',()=>{
 const sql=read('database/migrations/20270103_customer_booking_telegram_outbox.sql');
 assert.match(sql,/JOIN customer_telegram_links l ON l.user_id=u.id AND l.notification_opt_in_at IS NOT NULL/);
 assert.match(sql,/AFTER INSERT OR UPDATE OF status,booking_time,duration_minutes,service_id,barber_id ON bookings/);
 assert.match(sql,/AFTER UPDATE OF notification_opt_in_at OR DELETE ON customer_telegram_links/);
 assert.match(sql,/SET status='cancelled',updated_at=clock_timestamp\(\)/);
 assert.match(sql,/u.admin_suspended_at IS NULL/);
 assert.match(sql,/expected_duration_minutes|expected_service_id|expected_barber_id/);
 assert.doesNotMatch(sql,/telegram_otp_contacts|sendMessage|INSERT INTO bookings|DELETE FROM bookings/);
 assert.doesNotMatch(sql,/INSERT INTO customer_booking_telegram_outbox\s*\([^)]*chat_id/);
});
test('v191: migration preserves old chain, adds only new table/triggers, no backfill',()=>{
 const boot=read('database/bootstrap.sql');const verify=read('database/bootstrap/verify.sql');
 assert.ok(boot.indexOf('20270102_customer_telegram_opt_in.sql')<boot.indexOf('20270103_customer_booking_telegram_outbox.sql'));
 assert.match(verify,/customer_booking_telegram_outbox/);
 assert.match(verify,/20270103_customer_booking_telegram_outbox/);
 const sql=read('database/migrations/20270103_customer_booking_telegram_outbox.sql');
 assert.match(sql,/REFERENCES bookings\(id\) ON DELETE CASCADE/);
 assert.match(sql,/CHECK\(status IN \('queued','sending','accepted','uncertain','cancelled'\)\)/);
 assert.match(sql,/INSERT INTO ustara_schema_migrations\(version\)/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|UPDATE bookings SET|DELETE FROM bookings/);
});
test('v191: notification worker is manually enabled, never launched during normal backend startup',()=>{
 const worker=read('telegram/customerBookingNotificationWorkerV191.js');
 assert.match(worker,/ENABLE_CUSTOMER_BOOKING_NOTICE_WORKER/);
 assert.match(worker,/===|!==/);
 assert.doesNotMatch(read('server.js'),/customerBookingNotificationWorkerV191/);
 assert.doesNotMatch(read('telegram/worker.js'),/customerBookingNotificationWorkerV191/);
});
