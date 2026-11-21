'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
// The QR controller imports the DB pool at module load; injected fakes are
// used here. These are mock tests, NOT PostgreSQL integration evidence.
const dbPath=require.resolve('../db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{}};
const {createHandlers}=require('../controllers/walkinQrController');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const success=(...r)=>({rowCount:r.length,rows:r});
const token='a'.repeat(48),receipt='b'.repeat(32);
const barber={id:9,profileId:7,role:'barber'};
const customer={role:'customer',profileId:17,accountId:8};
function qrScenario({insertLive=true,consumeOk=true}={}){
 const events=[];
 const c={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.includes('FROM walkin_qr_tokens')&&sql.includes('FOR UPDATE'))return success({id:5,barber_id:7,used_at:null,token_live:true});
  if(sql.includes('AS used,') && sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return success({used:!consumeOk,token_live:true});
  if(sql.includes('FROM walkin_qr_tokens WHERE id=$1'))return success({token_live:true});
  if(sql.includes('WHERE qr_token_id=$1'))return success();
  if(sql.includes('SELECT b.id FROM barbers'))return success({id:7});
  if(sql.includes('AS open_now'))return success({open_now:true});
  if(sql.includes('count(*)::int AS total'))return success({total:0});
  if(sql.includes('INSERT INTO walkin_qr_requests'))return insertLive?success({id:101}):success();
  if(sql.includes('UPDATE walkin_qr_tokens SET used_at='))return consumeOk?success({id:5}):success();
  return success();
 },release(){}};
 const handlers=createHandlers({connect:async()=>c});
 async function join(){const response={statusCode:200,status(code){this.statusCode=code;return this;},set(){return this;},json(body){this.body=body;return this;}};
  await handlers.requestJoin({body:{token,request_id:receipt,label:'Mehmon'}},response);return response;
 }
 return {events,join};
}

test('v52/1 QR expiry at final INSERT aborts request before token consumption',async()=>{
 const s=qrScenario({insertLive:false});const r=await s.join();
 assert.equal(r.statusCode,410);assert.equal(r.body.code,'qr_expired');
 const insert=s.events.find(x=>x.sql.includes('INSERT INTO walkin_qr_requests'));
 assert.match(insert.sql,/FROM walkin_qr_tokens/);
 assert.match(insert.sql,/expires_at>clock_timestamp\(\)/);
 assert.match(insert.sql,/used_at IS NULL/);
 assert.ok(!s.events.some(x=>x.sql.includes('UPDATE walkin_qr_tokens SET used_at=')));
 assert.equal(s.events.at(-1).sql,'ROLLBACK');
});
test('v52/2 QR token consumption must affect exactly one row or rollback join',async()=>{
 const s=qrScenario({consumeOk:false});const r=await s.join();
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'qr_used');
 assert.match(s.events.find(x=>x.sql.includes('UPDATE walkin_qr_tokens SET used_at=')).sql,/RETURNING id/);
 assert.equal(s.events.at(-1).sql,'ROLLBACK');
});

function offerScenario({finalWrite=true}={}){
 const events=[];
 const c={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('t.token_hash=$1')&&!sql.includes('FOR SHARE'))return success({entry_id:3,barber_id:7});
  if(sql.includes('FOR SHARE OF r'))return success({ok:true});
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return success({db_now:new Date()});
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return success({
   opening_id:2,barber_id:7,start_at:new Date(Date.now()+3600000),duration_minutes:30,
   state:'offered',id:44,status:'pending',expires_at:new Date(Date.now()+300000),queue_status:'waiting',queue_today:true});
  if(sql.includes('AS taken'))return success({taken:false});
  if(sql.includes('UPDATE smart_booking_offers f'))return finalWrite?success({id:44}):success();
  return success();
 },release(){}};
 return {events,service:createSmartBookingOffers({connect:async()=>c})};
}
test('v52/3 late offer response is expired, not accepted; unsent Telegram notice cleaned',async()=>{
 const s=offerScenario({finalWrite:false});
 const result=await s.service.decide({token,request_id:receipt,offer_id:44,action:'accept'});
 assert.equal(result.httpStatus,410);assert.equal(result.code,'offer_expired');
 const attempt=s.events.findIndex(x=>x.sql.includes('UPDATE smart_booking_offers f'));
 const sql=s.events[attempt].sql;
 assert.match(sql,/f\.expires_at>clock_timestamp\(\)/);
 assert.match(sql,/q\.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(sql,/o\.start_at>clock_timestamp\(\)\+interval '5 minutes'/);
 assert.match(sql,/RETURNING f\.id/);
 assert.ok(s.events.slice(attempt+1).some(x=>x.sql.includes("status='expired'")));
 assert.ok(s.events.slice(attempt+1).some(x=>x.sql.includes('UPDATE smart_booking_telegram_outbox')));
 assert.equal(s.events.at(-1).sql,'COMMIT');
});

function confirmScenario({finalWindow=true,queueTransition=true}={}){
 const events=[];
 const start=new Date(Date.now()+3600000);
 const c={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t'))return success({entry_id:21,barber_id:7});
  if(sql.includes('FROM customers c JOIN users u'))return success({id:17});
  if(sql.startsWith('SELECT f.id,f.status,f.decided_at'))return success({id:44,status:'accepted',decided_at:new Date(),expires_at:start,
   opening_id:2,barber_id:7,start_at:start,duration_minutes:30,state:'accepted',entry_id:21,queue_status:'waiting',queue_date:'2026-11-19'});
  if(sql.includes('FROM smart_booking_confirmations x JOIN bookings'))return success();
  if(sql.includes('SELECT clock_timestamp() AS now'))return success({now:new Date()});
  if(sql.includes('SELECT ($1::date='))return success({today:true});
  if(sql.includes('FROM barbers b')&&sql.includes('FOR SHARE'))return success({id:7,accepting_bookings:true,verification_status:'approved'});
  if(sql.includes('FROM services s')&&sql.includes('ORDER BY id'))return success({id:6,name:'Soch olish',price:'50000.00',duration_minutes:30});
  if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return success({fits:true});
  if(sql.includes('AS taken'))return success({taken:false});
  if(sql.includes('FROM bookings WHERE customer_id='))return success();
  if(sql.includes('INSERT INTO bookings('))return finalWindow?success({id:501,status:'confirmed'}):success();
  if(sql.includes("UPDATE walkin_queue SET status='left'"))return queueTransition?success({id:21}):success();
  return success();
 },release(){}};
 return {events,service:createSmartBookingConfirmation({connect:async()=>c})};
}
const confirmation={token,request_id:receipt,offer_id:44,service_id:6,expected_total_price:'50000.00',actor:customer};
test('v52/4 reservation cannot be inserted after final DB cutoff; no confirmation survives',async()=>{
 const s=confirmScenario({finalWindow:false});
 await assert.rejects(s.service.confirm(confirmation),{status:410,code:'confirmation_expired'});
 const insertion=s.events.find(x=>x.sql.includes('INSERT INTO bookings('));
 assert.match(insertion.sql,/clock_timestamp\(\)<f\.decided_at\+interval '2 minutes'/);
 assert.match(insertion.sql,/o\.start_at>clock_timestamp\(\)\+interval '5 minutes'/);
 assert.match(insertion.sql,/q\.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.equal(s.events.some(x=>x.sql.includes('INSERT INTO smart_booking_confirmations')),false);
 assert.equal(s.events.at(-1).sql,'ROLLBACK');
});
test('v52/5 queue must actually transition to left or booking is rolled back',async()=>{
 const s=confirmScenario({queueTransition:false});
 await assert.rejects(s.service.confirm(confirmation),{status:409,code:'queue_changed'});
 const transition=s.events.find(x=>x.sql.includes("UPDATE walkin_queue SET status='left'"));
 assert.match(transition.sql,/WHERE id=\$1 AND status='waiting' RETURNING id/);
 assert.ok(s.events.some(x=>x.sql.includes('INSERT INTO smart_booking_confirmations')));
 assert.equal(s.events.at(-1).sql,'ROLLBACK');
});
test('v52/6 valid reservation still commits exactly once and closes queue',async()=>{
 const s=confirmScenario();
 const result=await s.service.confirm(confirmation);
 assert.deepEqual(result,{booking_id:501,status:'confirmed',replayed:false});
 assert.equal(s.events.filter(x=>x.sql.includes('INSERT INTO bookings(')).length,1);
 assert.equal(s.events.at(-1).sql,'COMMIT');
});
