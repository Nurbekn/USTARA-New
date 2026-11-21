'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const rows=r=>({rows:r,rowCount:r.length});
const token='a'.repeat(48),receipt='b'.repeat(32);
const actor={role:'customer',profileId:17,accountId:8};
const start=new Date(Date.now()+3600000);
const asDate=new Date(Date.now()-30000);
function fixture({owner=true,account=true,already=null,offerStatus='accepted',offerState='accepted',
   queueStatus='waiting',expired=false,barber=true,manualOwned=true,selectionDuration=30,price='50000.00',
   fits=true,slotTaken=false,customerBusy=false,catalog=null,offeredDuration=30,qrProofLive=true}={}){
 const queries=[];
 const c={async query(sql,args=[]){
  queries.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t'))return rows((sql.includes('FOR SHARE OF r')?qrProofLive:owner)?[{entry_id:21,barber_id:3}]:[]);
  if(sql.includes('JOIN walkin_manual_claims m'))return rows(manualOwned?[{entry_id:21,barber_id:3}]:[]);
  if(sql.includes('FROM customers c JOIN users u'))return rows(account?[{id:17}]:[]);
  if(sql.trimStart().startsWith('SELECT')&&sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows([{
   id:5,status:offerStatus,valid:!expired,decided_at:expired?new Date(Date.now()-130000):asDate,
   expires_at:start,opening_id:11,barber_id:3,start_at:start,duration_minutes:offeredDuration,
   state:offerState,entry_id:21,queue_status:queueStatus,queue_date:'2026-11-18'}]);
  if(sql.includes('FROM smart_booking_confirmations x JOIN bookings'))return rows(already?[already]:[]);
  if(sql.includes('SELECT clock_timestamp() AS now'))return rows([{now:new Date()}]);
  if(sql.includes('SELECT ($1::date='))return rows([{today:true}]);
  if(sql.includes('FROM barbers b') && sql.includes('FOR SHARE'))return rows(barber?[{id:3,accepting_bookings:true,verification_status:'approved'}]:[]);
  if(sql.includes('FROM services s')&&sql.includes('ORDER BY id')){
   const list=catalog||[{id:7,name:'Soch olish',price,duration_minutes:selectionDuration}];
   return rows(sql.includes('id=ANY(')?list.filter(s=>args[1].includes(s.id)):
    sql.includes('duration_minutes=$2')?list.filter(s=>s.duration_minutes===Number(args[1])):list);
  }
  if(sql.includes('FROM services s')&&sql.includes('duration_minutes BETWEEN'))return rows(catalog||[
   {id:7,name:'Soch olish',price,duration_minutes:selectionDuration}]);
  if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return rows([{fits}]);
  if(sql.includes('AS taken'))return rows([{taken:slotTaken}]);
  if(sql.includes('FROM bookings WHERE customer_id='))return rows(customerBusy?[{id:44}]:[]);
  if(sql.includes('INSERT INTO bookings('))return rows([{id:301,status:'confirmed'}]);
  if(sql.includes("UPDATE walkin_queue SET status='left'"))return rows([{id:21}]);
  if(sql==='COMMIT')return {command:'COMMIT',rows:[],rowCount:0};
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c},queries};
}
const body={token,request_id:receipt,offer_id:5,service_id:7,expected_total_price:'50000.00',actor};
test('v27 confirmation rejects unauthenticated customer before DB access',async()=>{
 const f=fixture();await assert.rejects(createSmartBookingConfirmation(f.db).confirm({...body,actor:{role:'barber'}}),{status:403});
 assert.equal(f.queries.length,0);
});
test('v27 atomic confirm matches service, verifies QR and authenticated account before booking',async()=>{
 const f=fixture();const result=await createSmartBookingConfirmation(f.db).confirm(body);
 assert.deepEqual(result,{booking_id:301,status:'confirmed',replayed:false});
 const list=f.queries.map(x=>x.sql);
 const customer=list.findIndex(x=>x.includes('FROM customers c JOIN users u'));
 const barberLock=list.findIndex(x=>x.includes('pg_advisory_xact_lock'));
 const insertion=list.findIndex(x=>x.includes('INSERT INTO bookings('));
 assert.ok(customer>=0&&customer<barberLock&&barberLock<insertion);
 assert.ok(list.some(x=>x.includes('FROM services s')&&x.includes('FOR SHARE')));
 assert.ok(list.some(x=>x.includes('ustara_effective_day_schedule')));
 assert.ok(list.some(x=>x.includes('INSERT INTO booking_services')));
 assert.ok(list.some(x=>x.includes('INSERT INTO smart_booking_confirmations')));
 assert.ok(list.some(x=>x.includes("UPDATE walkin_queue SET status='left'")));
 assert.equal(list.at(-1),'COMMIT');
 assert.equal(f.queries.some(x=>JSON.stringify(x.args).includes(token)||JSON.stringify(x.args).includes(receipt)),false);
});
test('v27 retries return existing booking ID without writing another booking',async()=>{
 const f=fixture({already:{customer_id:17,booking_id:99,status:'confirmed'}});
 assert.deepEqual(await createSmartBookingConfirmation(f.db).confirm(body),{booking_id:99,status:'confirmed',replayed:true});
 assert.ok(!f.queries.some(x=>x.sql.includes('INSERT INTO bookings(')));
});
test('v27 replay from another customer cannot reveal booking ID',async()=>{
 const f=fixture({already:{customer_id:55,booking_id:99,status:'confirmed'}});
 await assert.rejects(createSmartBookingConfirmation(f.db).confirm(body),{status:409,code:'already_booked'});
});
test('v27 confirm rejects forged QR, expired acceptance, wrong duration and wrong price',async()=>{
 for(const [opts,status,code] of [
  [{owner:false},404,'ticket_missing'],
  [{account:false},401,'invalid_session'],
  [{expired:true},410,'confirmation_expired'],
  [{selectionDuration:40},409,'duration_mismatch'],
  [{price:'60000.00'},409,'price_changed'],
  [{slotTaken:true},409,'slot_taken'],
  [{customerBusy:true},409,'customer_time_conflict'],
 ]){
  const f=fixture(opts);
  await assert.rejects(createSmartBookingConfirmation(f.db).confirm(body),{status,code});
  assert.ok(!f.queries.some(x=>x.sql.includes('INSERT INTO bookings(')));
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');
 }
});
test('v27 confirmation migration enforces unique offer and booking, separate offer consent',()=>{
 const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../database/migrations/20261209_smart_booking_confirmation.sql'),'utf8');
 assert.match(sql,/offer_id BIGINT PRIMARY KEY/);
 assert.match(sql,/booking_id INTEGER NOT NULL UNIQUE/);
 assert.match(sql,/offers_consent_at TIMESTAMPTZ/);
 assert.match(sql,/offer_id BIGINT NOT NULL UNIQUE REFERENCES smart_booking_offers/);
});


test('v28 two-service bundle creates exactly one booking and two ordered immutable snapshots',async()=>{
 const catalog=[{id:7,name:'Qirqish',price:'50000.00',duration_minutes:20},
  {id:9,name:'Soqol',price:'30000.00',duration_minutes:10}];
 const f=fixture({catalog});
 const result=await createSmartBookingConfirmation(f.db).confirm({
  ...body,service_id:undefined,service_ids:[9,7],expected_total_price:'80000.00'
 });
 assert.equal(result.booking_id,301);
 const booking=f.queries.find(q=>q.sql.includes('INSERT INTO bookings('));
 assert.deepEqual(booking.args.slice(2,3),[9]);
 assert.equal(booking.args[4],30);
 assert.equal(booking.args[5],'80000.00');
 const snapshots=f.queries.filter(q=>q.sql.includes('INSERT INTO booking_services'));
 assert.equal(snapshots.length,2);
 assert.deepEqual(snapshots.map(q=>q.args.slice(1)),[
  [0,9,'Soqol','30000.00',10],
  [1,7,'Qirqish','50000.00',20],
 ]);
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v28 bundle cannot be longer, shorter, duplicate, tampered or contradictory',async()=>{
 const catalog=[{id:7,name:'Qirqish',price:'50000.00',duration_minutes:20},
  {id:9,name:'Soqol',price:'30000.00',duration_minutes:10}];
 for(const [chosen,price,status,code] of [
  [[7],'50000.00',409,'duration_mismatch'],
  [[7,9,10],'80000.00',400,'service_unavailable'],
  [[7,9],'79999.00',409,'price_changed'],
 ]){
  const f=fixture({catalog});
  await assert.rejects(createSmartBookingConfirmation(f.db).confirm({
   ...body,service_id:undefined,service_ids:chosen,expected_total_price:price,
  }),{status,code});
  assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO bookings(')),false);
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');
 }
 for(const invalid of [[],[7,7],Array.from({length:21},(_,i)=>i+1),['7',9]]){
  const f=fixture({catalog});
  await assert.rejects(createSmartBookingConfirmation(f.db).confirm({
   ...body,service_id:undefined,service_ids:invalid
  }),{status:400,code:'invalid_selection'});
  assert.equal(f.queries.length,0);
 }
 const f=fixture({catalog});
 await assert.rejects(createSmartBookingConfirmation(f.db).confirm({
  ...body,service_ids:[7,9]
 }),{status:400,code:'invalid_selection'});
});
test('v28 quote endpoint includes short services and target duration without leaking ticket',async()=>{
 const catalog=[{id:7,name:'A',price:'50000.00',duration_minutes:20},
  {id:9,name:'B',price:'30000.00',duration_minutes:10}];
 const f=fixture({catalog});
 const result=await createSmartBookingConfirmation(f.db).services({
  token,request_id:receipt,offer_id:5,multi_service:true,
 });
 assert.equal(result.duration_minutes,30);
 assert.equal(result.max_services,20);
 assert.deepEqual(result.services,catalog);
 const q=f.queries.find(x=>x.sql.includes('duration_minutes BETWEEN'));
 assert.ok(q,'quote must list active services shorter than opening, not only exact duration');
 assert.equal(q.args[1],30);
 assert.equal(f.queries.some(x=>JSON.stringify(x.args).includes(token)),false);
});

test('v28 older single-service quote remains exactly duration-matched',async()=>{
 const catalog=[{id:7,name:'Short',price:'15000.00',duration_minutes:10},
  {id:9,name:'Exact',price:'50000.00',duration_minutes:30}];
 const f=fixture({catalog});
 const quote=await createSmartBookingConfirmation(f.db).services({token,request_id:receipt,offer_id:5});
 assert.deepEqual(quote.services,[catalog[1]]);
 assert.ok(f.queries.some(x=>x.sql.includes('duration_minutes=$2')));
});


test('v31 confirm rechecks QR ownership after locking offer, before replay or insert',async()=>{
 const f=fixture({qrProofLive:false,already:{customer_id:17,booking_id:99,status:'confirmed'}});
 await assert.rejects(createSmartBookingConfirmation(f.db).confirm(body),
  {status:404,code:'ticket_missing'});
 const locked=f.queries.findIndex(q=>q.sql.includes('FOR UPDATE OF f,o,q'));
 const proof=f.queries.findIndex(q=>q.sql.includes('FOR SHARE OF r'));
 assert.ok(locked>=0&&proof>locked);
 assert.ok(!f.queries.some(q=>q.sql.includes('INSERT INTO bookings(')));
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});


test('v32 completed manual booking replay returns same booking ID after queue becomes left',async()=>{
 const f=fixture({queueStatus:'left',already:{customer_id:17,booking_id:99,status:'confirmed'}});
 const replay=await createSmartBookingConfirmation(f.db).confirm({
  offer_id:5,service_id:7,expected_total_price:'50000.00',actor,manual:true,
 });
 assert.deepEqual(replay,{booking_id:99,status:'confirmed',replayed:true});
 const checks=f.queries.filter(q=>q.sql.includes('JOIN walkin_manual_claims m'));
 assert.equal(checks.length,2,'manual claim must be rechecked after barber lock');
 for(const check of checks){
  assert.match(check.sql,/smart_booking_confirmations x/);
  assert.match(check.sql,/x\.customer_id=\$2/);
  assert.match(check.sql,/q\.status='left' AND x\.offer_id IS NOT NULL/);
  assert.deepEqual(check.args,[5,17]);
 }
 assert.ok(!f.queries.some(q=>q.sql.includes('INSERT INTO bookings(')));
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});

test('v32 missing manual ownership cannot replay a completed booking',async()=>{
 const f=fixture({manualOwned:false,queueStatus:'left',already:{customer_id:17,booking_id:99,status:'confirmed'}});
 await assert.rejects(createSmartBookingConfirmation(f.db).confirm({
  offer_id:5,service_id:7,expected_total_price:'50000.00',actor,manual:true,
 }),{status:404,code:'offer_missing'});
 assert.ok(!f.queries.some(q=>q.sql.includes('SELECT x.customer_id,b.id AS booking_id')));
 assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});

test('v32 manual non-replay offer actions still require waiting queue status',async()=>{
 const {ownedEntry}=require('../services/manualQueueClaims');
 const seen=[];
 const c={async query(sql,args){seen.push({sql,args});return rows([]);}};
 await assert.rejects(ownedEntry(c,5,17),{status:404,code:'offer_missing'});
 assert.match(seen[0].sql,/q\.status='waiting'/);
 assert.doesNotMatch(seen[0].sql,/smart_booking_confirmations x/);
});

// v34: account deactivation locks users first. Booking confirmation must also
// lock users through COMMIT; locking customers alone is not enough.
test('v34 confirmation locks user and customer identity before barber and booking writes',async()=>{
 const f=fixture();
 const result=await createSmartBookingConfirmation(f.db).confirm(body);
 assert.equal(result.status,'confirmed');
 const identity=f.queries.findIndex(q=>q.sql.includes('FROM customers c JOIN users u'));
 const barberLock=f.queries.findIndex(q=>q.sql.includes('pg_advisory_xact_lock'));
 const insert=f.queries.findIndex(q=>q.sql.includes('INSERT INTO bookings('));
 assert.ok(identity>=0&&identity<barberLock&&barberLock<insert);
 assert.match(f.queries[identity].sql,/u\.deactivated_at IS NULL\s+FOR UPDATE OF c,u/);
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('v34 deactivated customer cannot confirm or replay under a stale session',async()=>{
 for(const already of [null,{customer_id:17,booking_id:99,status:'confirmed'}]){
  const f=fixture({account:false,already});
  await assert.rejects(createSmartBookingConfirmation(f.db).confirm(body),
   {status:401,code:'invalid_session'});
  assert.equal(f.queries.some(q=>q.sql.includes('pg_advisory_xact_lock')),false);
  assert.equal(f.queries.some(q=>q.sql.includes('INSERT INTO bookings(')),false);
  assert.equal(f.queries.at(-1).sql,'ROLLBACK');
 }
});
