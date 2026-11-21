'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSmartBookingOffers,isLive}=require('../services/smartBookingOffers');
const rows=x=>({rows:x,rowCount:x.length});
const tomorrow=()=>new Date(Date.now()+3600000);
const token='a'.repeat(48),receipt='b'.repeat(32);
function fixture({offered,owner=true,slotTaken=false,opening=true,pendingOffer,offerStatus='pending',expired=false,queueStatus='waiting',startAt,openingState='open',acceptedRow=null,telegramLinked=true,qrProofLive=true,telegramProofLive=true,queueToday=true}={}){
 const events=[];
 const c={query:async(sql,args=[])=>{
  events.push({sql,args});
  if(sql.includes('SELECT enabled FROM smart_booking_admin_settings'))return rows([{enabled:true}]);
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return rows([{db_now:new Date()}]);
  if(sql.includes('FROM smart_booking_openings') && sql.includes('next_check_at<=clock_timestamp()'))return rows(opening?[{id:2,barber_id:3}]:[]);
  if(sql.includes('FROM smart_booking_openings') && sql.includes('FOR UPDATE'))return rows([{id:2,barber_id:3,start_at:tomorrow(),duration_minutes:30,state:openingState}]);
  if(sql.includes('AS taken'))return rows([{taken:slotTaken}]);
  if(sql.includes('SELECT f.id,f.decided_at FROM smart_booking_offers f'))return rows(acceptedRow?[acceptedRow]:[]);
  if(sql.includes('FROM smart_booking_telegram_outbox o'))return rows(telegramLinked?[{entry_id:7,barber_id:3}]:[]);
  if(sql.includes('FOR SHARE OF s,t'))return rows(telegramProofLive?[{ok:true}]:[]);
  if(sql.includes('FOR SHARE OF r'))return rows(qrProofLive?[{ok:true}]:[]);
  if(sql.includes('FROM smart_booking_offers') && sql.includes('WHERE opening_id=$1') && sql.includes('FOR UPDATE'))return rows(pendingOffer?[pendingOffer]:[]);
  if(sql.includes('SELECT q.id FROM walkin_queue q'))return rows(offered?[{id:7}]:[]);
  if(sql.includes('INSERT INTO smart_booking_offers'))return rows([{id:11,expires_at:tomorrow()}]);
  if(sql.includes('UPDATE smart_booking_offers f'))return rows([{id:11}]);
  if(sql.includes('FROM walkin_qr_requests r') && sql.includes('t.token_hash=$1'))return rows(owner?[{entry_id:7,barber_id:3}]:[]);
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows(offered?[{
   opening_id:2,barber_id:3,start_at:startAt||tomorrow(),duration_minutes:30,state:'offered',
   id:11,status:offerStatus,expires_at:expired?new Date(Date.now()-10000):tomorrow(),queue_status:queueStatus,queue_today:queueToday
  }]:[]);
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c},events};
}
test('v26 cancellation trigger makes an opening only for today and with 5-minute lead',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../database/migrations/20261208_smart_booking_offers.sql'),'utf8');
 assert.match(sql,/AFTER UPDATE OF status ON bookings/);
 assert.match(sql,/OLD.status IN \('pending','confirmed'\) AND NEW.status='cancelled'/);
 assert.match(sql,/ON CONFLICT\(source_booking_id\) DO NOTHING/);
 assert.match(sql,/clock_timestamp\(\)\+interval '5 minutes'/);
 assert.match(sql,/CREATE UNIQUE INDEX smart_booking_one_pending_opening/);
 assert.match(sql,/CREATE UNIQUE INDEX smart_booking_one_pending_entry/);
 assert.match(sql,/CONSTRAINT smart_booking_offer_once UNIQUE\(opening_id,entry_id\)/);
 assert.ok(sql.includes("20261207_queue_telegram_notifications"));
});
test('worker does not create offers for empty opportunities',async()=>{
 const f=fixture({opening:false});assert.deepEqual(await createSmartBookingOffers(f.db).tick(),{kind:'idle'});
 assert.ok(!f.events.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('worker selects eligible QR waiting candidate under barber lock and 5-minute deadline',async()=>{
 const f=fixture({offered:true});const result=await createSmartBookingOffers(f.db).tick();
 assert.deepEqual(result,{kind:'offered',offer_id:11});
 assert.ok(f.events.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(f.events.some(x=>x.sql.includes('FOR UPDATE') && x.sql.includes('smart_booking_openings')));
 assert.ok(f.events.some(x=>x.sql.includes('NOT EXISTS(SELECT 1 FROM smart_booking_offers o')));
 assert.ok(f.events.some(x=>x.sql.includes("clock_timestamp()+interval '5 minutes'")));
});
test('no candidate leaves opportunity open without inventing a booking',async()=>{
 const f=fixture({offered:false});assert.equal((await createSmartBookingOffers(f.db).tick()).kind,'no_candidate');
 assert.ok(f.events.some(x=>x.sql.includes("next_check_at=clock_timestamp()+interval '30 seconds'")));
 assert.ok(!f.events.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('worker closes taken slots and does not invite another guest',async()=>{
 const f=fixture({offered:true,slotTaken:true});assert.equal((await createSmartBookingOffers(f.db).tick()).kind,'closed');
 assert.ok(!f.events.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('guest accepts offer once; authorization uses hashed QR receipt, no raw secret',async()=>{
 const f=fixture({offered:true});const service=createSmartBookingOffers(f.db);
 const r=await service.decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(r.offer.status,'accepted');assert.equal(r.replayed,false);
 assert.ok(f.events.some(x=>x.sql.includes('pg_advisory_xact_lock')));
 assert.ok(f.events.some(x=>x.sql.includes('FOR UPDATE OF o,f,q')));
 assert.ok(f.events.some(x=>x.sql.includes("state=$2")&&x.args.includes('accepted')));
 assert.equal(f.events.some(x=>JSON.stringify(x.args).includes(token)||JSON.stringify(x.args).includes(receipt)),false);
});
test('forged secret fails before write, wrong action fails before DB',async()=>{
 const f=fixture({offered:true,owner:false});const service=createSmartBookingOffers(f.db);
 await assert.rejects(service.decide({token:'bad',request_id:receipt,offer_id:11,action:'accept'}),{status:400});
 await assert.rejects(service.decide({token,request_id:receipt,offer_id:11,action:'send'}),{status:400});
 await assert.rejects(service.decide({token,request_id:receipt,offer_id:11,action:'accept'}),{status:404});
 assert.equal(f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')),false);
});
test('accepting a slot another booking took returns conflict, not success',async()=>{
 const f=fixture({offered:true,slotTaken:true});const r=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(r.httpStatus,409);assert.equal(r.code,'slot_taken');
 assert.ok(f.events.some(x=>x.sql.includes("state='closed'")));
});
test('expiry and reject are terminal for an offer, free opening for next person',async()=>{
 const f=fixture({offered:true});const service=createSmartBookingOffers(f.db);
 const r=await service.decide({token,request_id:receipt,offer_id:11,action:'reject'});
 assert.equal(r.offer.status,'rejected');
 assert.ok(f.events.some(x=>x.sql.includes("state=$2")&&x.args.includes('open')));
 assert.equal(isLive({status:'pending',expires_at:new Date(Date.now()-1)}),false);
});

test('retry of accept returns identical accepted status, without issuing a second UPDATE',async()=>{
 const f=fixture({offered:true,offerStatus:'accepted'});
 const r=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(r.replayed,true);assert.equal(r.offer.status,'accepted');
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')));
});
test('accepted invitation can be cancelled once and becomes available for the next candidate',async()=>{
 const f=fixture({offered:true,offerStatus:'accepted'});
 const r=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'cancel'});
 assert.equal(r.offer.status,'cancelled');
 assert.ok(f.events.some(x=>x.sql.includes("status='cancelled'")));
 assert.ok(f.events.some(x=>x.sql.includes("state='open'")));
});
test('expired offer returns 410 and releases opening instead of accepting a stale answer',async()=>{
 const f=fixture({offered:true,expired:true});
 const r=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(r.httpStatus,410);assert.equal(r.code,'offer_expired');
 assert.ok(f.events.some(x=>x.sql.includes("status='expired'")));
});
test('guest whose ticket is called cannot accept pending invitation',async()=>{
 const f=fixture({offered:true,queueStatus:'called'});
 const r=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(r.httpStatus,410);
});
test('conflicting decision of already accepted offer fails with 409, no second state transition',async()=>{
 const f=fixture({offered:true,offerStatus:'accepted'});
 await assert.rejects(createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'reject'}),{status:409,code:'already_decided'});
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')));
});

test('v27 accepted offer receives a two-minute confirmation grace, not an unlimited hold',async()=>{
 const f=fixture({openingState:'accepted',acceptedRow:{id:11,decided_at:new Date(Date.now()-30000)}});
 const r=await createSmartBookingOffers(f.db).tick();
 assert.deepEqual(r,{kind:'confirmation_waiting'});
 assert.ok(f.events.some(x=>x.sql.includes('next_check_at=$2')));
 assert.ok(!f.events.some(x=>x.sql.includes('INSERT INTO smart_booking_offers')));
});
test('v27 accepted offer expires after grace and another QR candidate can receive the opening',async()=>{
 const f=fixture({openingState:'accepted',acceptedRow:{id:11,decided_at:new Date(Date.now()-180000)},offered:true});
 const r=await createSmartBookingOffers(f.db).tick();
 assert.equal(r.kind,'offered');
 assert.ok(f.events.some(x=>x.sql.includes("status='expired'")));
 assert.ok(f.events.some(x=>x.sql.includes('INSERT INTO smart_booking_telegram_outbox')));
});
test('v27 Telegram callback requires a sent notification linked to the same active private chat',async()=>{
 let f=fixture({offered:true,telegramLinked:false});
 await assert.rejects(createSmartBookingOffers(f.db).decideByTelegram({offer_id:11,chat_id:250,message_id:77,action:'accept'}),{status:403});
 assert.ok(!f.events.some(x=>x.sql.includes('UPDATE smart_booking_offers')));
 f=fixture({offered:true,telegramLinked:true});
 const result=await createSmartBookingOffers(f.db).decideByTelegram({offer_id:11,chat_id:250,message_id:77,action:'accept'});
 assert.equal(result.offer.status,'accepted');
 assert.ok(f.events.some(x=>x.sql.includes("o.status='sent'")&&x.sql.includes('o.telegram_message_id=$3')));
});


// v31: a ticket or consent can be revoked WHILE the request waits for locks.
test('v31 QR decision rechecks approved receipt under offer/queue locks',async()=>{
 const f=fixture({offered:true,qrProofLive:false});
 await assert.rejects(createSmartBookingOffers(f.db).decide({
  token,request_id:receipt,offer_id:11,action:'accept'
 }),{status:403,code:'ticket_revoked'});
 const locked=f.events.findIndex(e=>e.sql.includes('FOR UPDATE OF o,f,q'));
 const proof=f.events.findIndex(e=>e.sql.includes('FOR SHARE OF r'));
 assert.ok(locked>=0&&proof>locked);
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_offers')));
});
test('v31 Telegram callback cannot accept after unsubscribe while waiting on barber lock',async()=>{
 const f=fixture({offered:true,telegramLinked:true,telegramProofLive:false});
 await assert.rejects(createSmartBookingOffers(f.db).decideByTelegram({
  offer_id:11,chat_id:250,message_id:77,action:'accept'
 }),{status:403,code:'callback_revoked'});
 const proof=f.events.find(e=>e.sql.includes('FOR SHARE OF s,t'));
 assert.ok(proof);
 assert.match(proof.sql,/s\.offers_consent_at<=t\.created_at/);
 assert.ok(proof.args.includes('250'));
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_offers')));
});
test('v31 valid callback keeps working, and verifies under locks before changing status',async()=>{
 const f=fixture({offered:true});
 const result=await createSmartBookingOffers(f.db).decideByTelegram({
  offer_id:11,chat_id:'250',message_id:77,action:'reject'
 });
 assert.equal(result.offer.status,'rejected');
 const locked=f.events.findIndex(e=>e.sql.includes('FOR UPDATE OF o,f,q'));
 const proof=f.events.findIndex(e=>e.sql.includes('FOR SHARE OF s,t'));
 const update=f.events.findIndex(e=>e.sql.includes('UPDATE smart_booking_offers'));
 assert.ok(locked>=0&&proof>locked&&update>proof);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});

// v48: a terminal offer transition and its unsent Telegram delivery must be
// committed together. Sending/sent/uncertain deliveries are never replayed.
function pendingDeliveryCancelled(events){
 const update=events.findIndex(e=>e.sql.includes('UPDATE smart_booking_telegram_outbox SET status=\'cancelled\''));
 assert.ok(update>=0,'missing synchronous Telegram outbox cleanup');
 assert.match(events[update].sql,/status='pending'/);
 assert.match(events[update].sql,/offer_id IN/);
 assert.ok(events[update].args.includes(2),'opening-id fence must be used');
 return update;
}
test('v48 worker closes taken opening and cancels unsent offers in same transaction',async()=>{
 const f=fixture({slotTaken:true,offered:true});
 assert.deepEqual(await createSmartBookingOffers(f.db).tick(),{kind:'closed'});
 const idx=pendingDeliveryCancelled(f.events);
 assert.ok(f.events[idx].sql.includes('lease_owner=NULL'));
 assert.ok(f.events.slice(idx+1).some(x=>x.sql.includes("state='closed'")));
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v48 pending offer expiry cancels stale notice before next candidate',async()=>{
 const f=fixture({pendingOffer:{id:11,expires_at:new Date(Date.now()-60000)},offered:false});
 assert.equal((await createSmartBookingOffers(f.db).tick()).kind,'no_candidate');
 const expired=f.events.findIndex(e=>e.sql.includes("status='expired'")&&e.sql.includes("status='pending'"));
 const cleaned=pendingDeliveryCancelled(f.events);
 assert.ok(expired>=0&&expired<cleaned);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v48 accepted two-minute grace expiry cleans legacy pending Telegram notice',async()=>{
 const f=fixture({openingState:'accepted',acceptedRow:{id:11,decided_at:new Date(Date.now()-180000)}});
 await createSmartBookingOffers(f.db).tick();
 assert.ok(f.events.some(e=>e.sql.includes("status='expired'")&&e.sql.includes("status='accepted'")));
 pendingDeliveryCancelled(f.events);
});
test('v48 client expired decision also cancels pending notice atomically',async()=>{
 const f=fixture({offered:true,expired:true});
 const result=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(result.httpStatus,410);
 pendingDeliveryCancelled(f.events);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v48 rejected because slot was taken cancels stale pending Telegram delivery',async()=>{
 const f=fixture({offered:true,slotTaken:true});
 const result=await createSmartBookingOffers(f.db).decide({token,request_id:receipt,offer_id:11,action:'accept'});
 assert.equal(result.code,'slot_taken');
 pendingDeliveryCancelled(f.events);
});
function barberCancellationFixture({state='offered',failOnNotice=false}={}){
 const events=[];
 const client={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.includes('SELECT b.id FROM barbers'))return rows([{id:3}]);
  if(sql.includes('SELECT id,state FROM smart_booking_openings'))return rows([{id:2,state}]);
  if(failOnNotice&&sql.includes('UPDATE smart_booking_telegram_outbox'))throw Error('outbox failed');
  return rows([]);
 },release(){}};
 return {events,service:createSmartBookingOffers({connect:async()=>client})};
}
test('v48 barber cancellation cleans notifications, including cancelled replay',async()=>{
 for(const state of ['offered','cancelled']){
  const f=barberCancellationFixture({state});
  const result=await f.service.cancelBarber(2,3,17);
  assert.equal(result.state,'cancelled');
  assert.equal(result.replayed,state==='cancelled');
  const idx=pendingDeliveryCancelled(f.events);
  assert.ok(idx>f.events.findIndex(e=>e.sql.includes('pg_advisory_xact_lock')));
  if(state==='cancelled')assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_openings')));
  assert.equal(f.events.at(-1).sql,'COMMIT');
 }
});
test('v48 failed outbox cleanup rolls back barber cancellation',async()=>{
 const f=barberCancellationFixture({failOnNotice:true});
 await assert.rejects(f.service.cancelBarber(2,3,17),/outbox failed/);
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_openings SET state=\'cancelled\'')));
});
test('v48 cancelled opening replay repairs pending offers, but never confirmed ones',async()=>{
 const f=barberCancellationFixture({state:'cancelled'});
 await f.service.cancelBarber(2,3,17);
 const changed=f.events.find(e=>e.sql.includes('UPDATE smart_booking_offers SET status=\'cancelled\''));
 assert.ok(changed);
 assert.match(changed.sql,/status='pending'/);
 pendingDeliveryCancelled(f.events);
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_openings')));
});
test('v48 rejected cancel on accepted opening does not touch Telegram outbox',async()=>{
 const f=barberCancellationFixture({state:'accepted'});
 await assert.rejects(f.service.cancelBarber(2,3,17),{status:409,code:'already_closed'});
 assert.equal(f.events.some(e=>e.sql.includes('UPDATE smart_booking_telegram_outbox')),false);
 assert.equal(f.events.at(-1).sql,'ROLLBACK');
});
