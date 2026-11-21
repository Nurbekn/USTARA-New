'use strict';
// v37 — customer-initiated walk-in exit, not a cancellation of confirmed bookings.
// QR uses a private token+receipt; manual tickets use the authenticated owner.
const {transaction,lockBarber,tokenHash,requestHash,fail}=require('./smartBookingOffers');
const {customerActor}=require('./manualQueueClaims');
const {cleanupTerminalQueue}=require('./queueOfferLifecycle');
const qrPattern=/^[a-f0-9]{48}$/;
const receiptPattern=/^[a-f0-9]{32}$/;
// A route ID is a canonical decimal PostgreSQL int4, never 0x10, 1e2 or 001.
function queueEntryId(value){
 if(typeof value==='number')return Number.isInteger(value)&&value>=1&&value<=2147483647?value:null;
 if(typeof value!=='string'||!/^[1-9][0-9]{0,9}$/.test(value))return null;
 const n=Number(value);
 return n<=2147483647?n:null;
}

async function closeQueueEntry(c,entryId,source,actorUserId){
 const row=await c.query(`SELECT id,status,queue_date FROM walkin_queue
  WHERE id=$1 FOR UPDATE`,[entryId]);
 if(!row.rowCount)throw fail(404,'ticket_missing','Navbat topilmadi.');
 const current=row.rows[0];
 if(current.status==='left'){
  await cleanupTerminalQueue(c,entryId);
  return {left:true,replayed:true};
 }
 // Arrival is not service start: a customer who checked in can still leave voluntarily.
 if(!['waiting','called','arrived'].includes(current.status))
  throw fail(409,'queue_finished','Yakunlangan navbatdan qayta chiqib bo‘lmaydi.');
 const today=await c.query(`SELECT ($1::date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS today`,[current.queue_date]);
 if(today.rows[0]?.today!==true)throw fail(410,'queue_expired','Faqat bugungi navbatdan chiqish mumkin.');
 // The barber advisory lock serializes exit with call-next, offer acceptance,
 // and manual claim/revoke. Never touch an already confirmed appointment.
 await cleanupTerminalQueue(c,entryId);
 await c.query(`UPDATE walkin_queue SET status='left',finished_at=clock_timestamp()
  WHERE id=$1 AND status IN ('waiting','called','arrived')`,[entryId]);
 await c.query(`INSERT INTO walkin_queue_events(entry_id,actor_user_id,action,actor_source)
  VALUES($1,$2,'left',$3)`,[entryId,actorUserId,source]);
 return {left:true,replayed:false};
}

function createQueueSelfExit(db){
 db=db||require('../db');
 async function leaveQr({token,request_id}){
  if(typeof token!=='string'||!qrPattern.test(token)||
     typeof request_id!=='string'||!receiptPattern.test(request_id))
   throw fail(400,'invalid_ticket','QR maʼlumoti noto‘g‘ri.');
  const token_hash=tokenHash(token),request_hash=requestHash(request_id);
  return transaction(db,async c=>{
   const found=await c.query(`SELECT q.id AS entry_id,q.barber_id FROM walkin_qr_requests r
    JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    JOIN walkin_queue q ON q.id=r.queue_entry_id
    WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'`,[token_hash,request_hash]);
   if(!found.rowCount)throw fail(404,'ticket_missing','QR navbat topilmadi.');
   const {entry_id,barber_id}=found.rows[0];
   await lockBarber(c,barber_id);
   // Revalidate after waiting for the barber lock: a revoked QR proof cannot
   // authorize an exit of somebody else's ticket. Hold proof lock to COMMIT.
   const proof=await c.query(`SELECT 1 FROM walkin_qr_requests r JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    WHERE r.queue_entry_id=$3 AND t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'
    FOR SHARE OF r`,[token_hash,request_hash,entry_id]);
   if(!proof.rowCount)throw fail(403,'ticket_revoked','QR tasdig‘i bekor qilingan.');
   return closeQueueEntry(c,entry_id,'qr_guest',null);
  });
 }
 async function leaveManual({entry_id,actor}){
  const id=queueEntryId(entry_id);
  if(!id)throw fail(400,'invalid_entry','Navbat ID noto‘g‘ri.');
  const identity=customerActor(actor);
  return transaction(db,async c=>{
   // Account identity locks precede the barber advisory lock (v34 ordering).
   const account=await c.query(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id
    WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
    FOR SHARE OF c,u`,[identity.customerId,identity.userId]);
   if(!account.rowCount)throw fail(401,'invalid_session','Mijoz sessiyasi yaroqsiz.');
   const linked=await c.query(`SELECT q.id,q.barber_id FROM walkin_manual_claims m JOIN walkin_queue q ON q.id=m.entry_id
    WHERE m.entry_id=$1 AND m.customer_id=$2 AND m.consent_at IS NOT NULL`,[id,identity.customerId]);
   if(!linked.rowCount)throw fail(404,'not_linked','Sizga tegishli navbat topilmadi.');
   await lockBarber(c,linked.rows[0].barber_id);
   const proof=await c.query(`SELECT 1 FROM walkin_manual_claims m JOIN walkin_queue q ON q.id=m.entry_id
    WHERE m.entry_id=$1 AND m.customer_id=$2 AND m.consent_at IS NOT NULL
    FOR SHARE OF m,q`,[id,identity.customerId]);
   if(!proof.rowCount)throw fail(403,'claim_revoked','Navbat bog‘lanishi bekor qilingan.');
   return closeQueueEntry(c,id,'customer',identity.userId);
  });
 }
 return {leaveQr,leaveManual};
}
module.exports={createQueueSelfExit,queueEntryId};
