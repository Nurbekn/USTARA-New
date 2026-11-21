'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const reply=rows=>({rows,rowCount:rows.length});
const ticket='a'.repeat(48),requestId='b'.repeat(32);
function fake({today=true}={}){
 const events=[];
 const connection={async query(sql,args=[]){
  events.push({sql,args});
  if(sql.includes('SELECT c.id FROM customers c JOIN users u'))return reply([{id:1}]);
  if(sql.includes('FROM smart_booking_offers f')&&sql.includes('JOIN walkin_manual_claims m'))return reply([{entry_id:7,barber_id:3}]);
  if(sql.includes('FROM walkin_qr_requests r')&&sql.includes('r.status=\'approved\'')&&!sql.includes('FOR SHARE'))return reply([{entry_id:7,barber_id:3}]);
  if(sql.includes('FOR SHARE OF r'))return reply([{ok:1}]);
  if(sql.includes('SELECT clock_timestamp() AS db_now'))return reply([{db_now:new Date()}]);
  if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o')){
   return reply([{opening_id:2,barber_id:3,start_at:new Date(Date.now()+3600000),duration_minutes:30,
    state:'offered',id:11,status:'pending',queue_status:'waiting',queue_today:today,
    expires_at:new Date(Date.now()+300000)}]);
  }
  if(sql.includes('AS taken'))return reply([{taken:false}]);
  if(sql.includes('UPDATE smart_booking_offers f'))return reply([{id:11}]);
  return reply([]);
 },release(){}};
 return {events,db:{connect:async()=>connection}};
}
test('v49 manual decision pins consent row until decision COMMIT',async()=>{
 const f=fake();const r=await createSmartBookingOffers(f.db).decideByCustomer({
  offer_id:11,action:'reject',actor:{role:'customer',profileId:1,accountId:2}});
 assert.equal(r.offer.status,'rejected');
 const owned=f.events.filter(x=>x.sql.includes('JOIN walkin_manual_claims m'));
 assert.equal(owned.length,2);
 assert.doesNotMatch(owned[0].sql,/FOR SHARE OF q,m/);
 assert.match(owned[1].sql,/FOR SHARE OF q,m/);
 const lock=f.events.findIndex(x=>x.sql.includes('pg_advisory_xact_lock'));
 const consent=f.events.findIndex(x=>x.sql.includes('FOR SHARE OF q,m'));
 const decided=f.events.findIndex(x=>x.sql.includes('UPDATE smart_booking_offers f'));
 assert.ok(lock>=0&&consent>lock&&decided>consent);
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v49 yesterday QR queue cannot accept an unexpired offer',async()=>{
 const f=fake({today:false});
 const result=await createSmartBookingOffers(f.db).decide({token:ticket,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(result.httpStatus,410);assert.equal(result.code,'ticket_expired');
 assert.ok(f.events.some(e=>e.sql.includes("status='expired'")));
 assert.ok(f.events.some(e=>e.sql.includes('UPDATE smart_booking_telegram_outbox')));
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_offers SET status=$2')));
 assert.equal(f.events.at(-1).sql,'COMMIT');
});
test('v49 yesterday QR queue cannot claim idempotent accepted replay',async()=>{
 const f=fake({today:false});
 const row=f.db.connect;f.db.connect=async()=>{
  const conn=await row();const query=conn.query;
  conn.query=async(sql,args=[])=>{
   if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))
    return reply([{opening_id:2,barber_id:3,start_at:new Date(Date.now()+3600000),duration_minutes:30,
      state:'accepted',id:11,status:'accepted',queue_status:'waiting',queue_today:false,
      decided_at:new Date(),expires_at:new Date(Date.now()+300000)}]);
   return query(sql,args);
  };return conn;
 };
 const result=await createSmartBookingOffers(f.db).decide({token:ticket,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(result.httpStatus,410);
 assert.equal(result.code,'ticket_expired');
 assert.notEqual(result.replayed,true);
});
test('v49 yesterday ticket can replay a confirmed booking but cannot create another',async()=>{
 const f=fake({today:false});const original=f.db.connect;
 f.db.connect=async()=>{
  const c=await original();const query=c.query;
  c.query=async(sql,args=[])=>{
   if(sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))
    return reply([{opening_id:2,barber_id:3,start_at:new Date(Date.now()+3600000),duration_minutes:30,
     state:'closed',id:11,status:'accepted',queue_status:'left',queue_today:false,
     decided_at:new Date(),expires_at:new Date(Date.now()-5000)}]);
   if(sql.includes('FROM smart_booking_confirmations WHERE offer_id'))return reply([{ok:true}]);
   return query(sql,args);
  };return c;
 };
 const result=await createSmartBookingOffers(f.db).decide({token:ticket,request_id:requestId,offer_id:11,action:'accept'});
 assert.equal(result.replayed,true);assert.equal(result.offer.status,'accepted');
 assert.ok(!f.events.some(e=>e.sql.includes('UPDATE smart_booking_offers')));
});
test('v49 Telegram callback rejects signed BIGINT overflow before touching database',async()=>{
 let connects=0;
 const service=createSmartBookingOffers({connect:async()=>{connects++;throw Error('should not connect');}});
 for(const chat of ['9223372036854775808','9999999999999999999','0','-9','not-a-chat']){
  await assert.rejects(service.decideByTelegram({offer_id:11,chat_id:chat,message_id:1,action:'accept'}),
   {status:400,code:'invalid_callback'});
 }
 assert.equal(connects,0);
});
test('v49 queue date check and manual row lock are present in decisions',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../services/smartBookingOffers.js'),'utf8');
 assert.match(source,/q\.queue_date=\(clock_timestamp\(\) AT TIME ZONE 'Asia\/Tashkent'\)::date/);
 assert.match(source,/await ownedEntry\(c,id,owner\.customerId,\{locked:true\}\)/);
});
