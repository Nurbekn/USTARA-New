'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSmartBookingConfirmation}=require('../services/smartBookingConfirmation');
const rows=v=>({rows:v,rowCount:v.length});
const qr='a'.repeat(48),receipt='b'.repeat(32);
const actor={role:'customer',profileId:17,accountId:8};
function fixture({replay=false}={}){
 const statements=[];
 const start=new Date(Date.now()+3600_000);
 const c={async query(sql,args=[]){
  statements.push({sql,args});
  if(sql.includes('FROM walkin_qr_requests r JOIN walkin_qr_tokens t'))return rows([{entry_id:21,barber_id:3}]);
  if(sql.includes('FROM customers c JOIN users u'))return rows([{id:17}]);
  if(sql.trimStart().startsWith('SELECT')&&sql.includes('FROM smart_booking_offers f JOIN smart_booking_openings o'))return rows([{id:5,status:'accepted',valid:true,decided_at:new Date(Date.now()-15000),expires_at:start,opening_id:11,barber_id:3,start_at:start,duration_minutes:30,state:'accepted',entry_id:21,queue_status:'waiting',queue_date:'2026-11-18'}]);
  if(sql.includes('FROM smart_booking_confirmations x JOIN bookings'))return rows(replay?[{customer_id:17,booking_id:301,status:'confirmed'}]:[]);
  if(sql.includes('SELECT clock_timestamp() AS now'))return rows([{now:new Date()}]);
  if(sql.includes('SELECT ($1::date='))return rows([{today:true}]);
  if(sql.includes('FROM barbers b')&&sql.includes('FOR SHARE'))return rows([{id:3,accepting_bookings:true,verification_status:'approved'}]);
  if(sql.includes('FROM services s'))return rows([{id:7,name:'Soch olish',price:'50000.00',duration_minutes:30}]);
  if(sql.includes('AS fits FROM ustara_effective_day_schedule'))return rows([{fits:true}]);
  if(sql.includes('AS taken'))return rows([{taken:false}]);
  if(sql.includes('FROM bookings WHERE customer_id='))return rows([]);
  if(sql.includes('INSERT INTO bookings('))return rows([{id:301,status:'confirmed'}]);
  if(sql.includes("UPDATE walkin_queue SET status='left'"))return rows([{id:21}]);
  return rows([]);
 },release(){}};
 return {db:{connect:async()=>c},statements};
}
const body={token:qr,request_id:receipt,offer_id:5,service_id:7,expected_total_price:'50000.00',actor};

test('v38 confirmed booking attributes queue exit to customer, never staff',async()=>{
 const f=fixture();await createSmartBookingConfirmation(f.db).confirm(body);
 const audit=f.statements.find(q=>q.sql.includes('INSERT INTO walkin_queue_events'));
 assert.ok(audit);assert.match(audit.sql,/actor_source/);assert.match(audit.sql,/'left','customer'/);
 assert.deepEqual(audit.args,[21,8]);
 assert.equal(f.statements.at(-1).sql,'COMMIT');
});
test('v38 booking atomically ends stale queue call notifications and removes leases',async()=>{
 const f=fixture();await createSmartBookingConfirmation(f.db).confirm(body);
 const q=f.statements.find(q=>q.sql.includes('UPDATE walkin_queue_notification_outbox'));
 assert.ok(q);assert.deepEqual(q.args,[21]);
 assert.match(q.sql,/status IN \('pending','processing'\)/);
 assert.match(q.sql,/lease_owner=NULL,lease_until=NULL/);
 const bookingIdx=f.statements.findIndex(q=>q.sql.includes('INSERT INTO bookings('));
 const cancelIdx=f.statements.indexOf(q);
 assert.ok(bookingIdx>=0&&cancelIdx>bookingIdx);
});
test('v38 booking drops offer notification, consent and unspent invite in same transaction',async()=>{
 const f=fixture();await createSmartBookingConfirmation(f.db).confirm(body);
 const list=f.statements.map(x=>x.sql);
 assert.ok(list.some(s=>s.includes('UPDATE smart_booking_telegram_outbox')&&s.includes("status='pending'")));
 assert.ok(list.some(s=>s.includes('DELETE FROM walkin_queue_telegram_subscriptions')));
 assert.ok(list.some(s=>s.includes('DELETE FROM walkin_queue_telegram_invites')));
 const cleanup=list.findIndex(s=>s.includes('DELETE FROM walkin_queue_telegram_invites'));
 assert.ok(cleanup>0&&cleanup<list.indexOf('COMMIT'));
 assert.equal(list.some(s=>s.includes('DELETE FROM bookings')),false);
});
test('v38 replay is read-only and returns same confirmed booking',async()=>{
 const f=fixture({replay:true});
 const result=await createSmartBookingConfirmation(f.db).confirm(body);
 assert.deepEqual(result,{booking_id:301,status:'confirmed',replayed:true});
 assert.equal(f.statements.some(q=>/^\s*(INSERT|UPDATE|DELETE)/i.test(q.sql)),false);
});
