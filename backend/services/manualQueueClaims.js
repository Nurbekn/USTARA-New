'use strict';
const crypto=require('node:crypto');
const {transaction,lockBarber,fail,positive}=require('./smartBookingOffers');
const digest=s=>crypto.createHash('sha256').update('ustara-manual-queue-v29:'+s).digest('hex');
const isCode=s=>typeof s==='string'&&/^[0-9a-f]{32}$/.test(s);
function customerActor(actor){
 const customerId=positive(actor?.profileId),userId=positive(actor?.accountId??actor?.id);
 if(actor?.role!=='customer'||!customerId||!userId)
  throw fail(403,'customer_required','Mijoz hisobiga kiring.');
 return {customerId,userId};
}
async function assertCustomer(c,{customerId,userId}){
 const account=await c.query(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id
   WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
   FOR UPDATE OF c,u`,[customerId,userId]);
 if(!account.rowCount)throw fail(401,'invalid_session','Mijoz sessiyasi yaroqsiz.');
}
async function ownedEntry(c,offerId,customerId,{allowConfirmedReplay=false,locked=false}={}){
 // A confirmed manual booking changes the queue to 'left'. Only the booking's
 // owning customer may replay confirmation; all other actions require waiting.
 // Keep consent bound to the original customer, including on replay.
 const completedJoin=allowConfirmedReplay?`LEFT JOIN smart_booking_confirmations x
  ON x.offer_id=f.id AND x.customer_id=$2`:'';
 const completedStatus=allowConfirmedReplay?`OR (q.status='left' AND x.offer_id IS NOT NULL)`:'';
 const r=await c.query(`SELECT q.id AS entry_id,q.barber_id FROM smart_booking_offers f
  JOIN walkin_queue q ON q.id=f.entry_id
  JOIN walkin_manual_claims m ON m.entry_id=q.id
  ${completedJoin}
  WHERE f.id=$1 AND m.customer_id=$2 AND m.consent_at IS NOT NULL
    AND (q.status='waiting' ${completedStatus})
    AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    ${locked?'FOR SHARE OF q,m':''}`,[offerId,customerId]);
 if(!r.rowCount)throw fail(404,'offer_missing','Sizga tegishli faol taklif topilmadi.');
 return r.rows[0];
}
function createManualQueueClaims(db){
 db=db||require('../db');
 async function issue({actor,entry_id}){
  const id=positive(entry_id),barberId=positive(actor?.profileId);
  if(actor?.role!=='barber'||!id||!barberId)throw fail(403,'barber_required','Faol sartarosh hisobi kerak.');
  const code=crypto.randomBytes(16).toString('hex');
  return transaction(db,async c=>{
   // Match identity-first ordering in the other Smart Booking flows. A pause
   // takes user locks before the barber advisory lock: reversing that order
   // can deadlock concurrent claim-code issuance and account deactivation.
   const barber=await c.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
    WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
     AND u.role='barber' AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[barberId,positive(actor.accountId??actor.id)]);
   if(!barber.rowCount)throw fail(403,'barber_required','Sartarosh hisobi tasdiqlanmagan.');
   await lockBarber(c,barberId);
   const ticket=await c.query(`SELECT q.id FROM walkin_queue q WHERE q.id=$1 AND q.barber_id=$2
    AND q.status='waiting' AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    AND NOT EXISTS(SELECT 1 FROM walkin_qr_requests r WHERE r.queue_entry_id=q.id)
    FOR UPDATE OF q`,[id,barberId]);
   if(!ticket.rowCount)throw fail(404,'manual_ticket_missing','Faol oddiy navbat topilmadi.');
   const previous=await c.query("SELECT customer_id,(claim_hash IS NOT NULL AND updated_at>clock_timestamp()-interval '1 minute') AS throttled FROM walkin_manual_claims WHERE entry_id=$1 FOR UPDATE",[id]);
   if(previous.rows[0]?.customer_id)throw fail(409,'already_claimed','Mijoz bu navbatni allaqachon bog‘lagan.');
   if(previous.rows[0]?.throttled===true)
    throw fail(429,'claim_rate_limited','Kod hozirgina yaratildi. Bir daqiqadan keyin yangilang.');
   const changed=await c.query(`INSERT INTO walkin_manual_claims(entry_id,claim_hash,claim_expires_at)
    VALUES($1,$2,clock_timestamp()+interval '15 minutes')
    ON CONFLICT(entry_id) DO UPDATE SET claim_hash=excluded.claim_hash,
       claim_expires_at=excluded.claim_expires_at,updated_at=clock_timestamp()
       WHERE walkin_manual_claims.customer_id IS NULL RETURNING claim_expires_at`,[id,digest(code)]);
   if(!changed.rowCount)throw fail(409,'already_claimed','Navbat allaqachon bog‘langan.');
   return {code,expires_at:changed.rows[0].claim_expires_at,entry_id:id};
  });
 }
 async function claim({code,actor}){
  const owner=customerActor(actor);
  if(!isCode(code))throw fail(400,'invalid_claim_code','16 baytlik navbat kodi noto‘g‘ri.');
  return transaction(db,async c=>{
   // Lock order follows regular bookings: customer before barber.
   await assertCustomer(c,owner);
   const found=await c.query(`SELECT q.id AS entry_id,q.barber_id FROM walkin_manual_claims m
    JOIN walkin_queue q ON q.id=m.entry_id
    WHERE m.claim_hash=$1`,[digest(code)]);
   if(!found.rowCount)throw fail(404,'invalid_claim_code','Kod topilmadi yoki ishlatilgan.');
   const {entry_id,barber_id}=found.rows[0];
   await lockBarber(c,barber_id);
   const eligible=await c.query(`SELECT m.entry_id FROM walkin_manual_claims m
    JOIN walkin_queue q ON q.id=m.entry_id WHERE m.entry_id=$1 AND q.barber_id=$2
     AND m.claim_hash=$3 AND m.customer_id IS NULL AND m.claim_expires_at>clock_timestamp()
     AND q.status='waiting'
     AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
     AND NOT EXISTS(SELECT 1 FROM walkin_qr_requests r WHERE r.queue_entry_id=q.id)
     FOR UPDATE OF m,q`,[entry_id,barber_id,digest(code)]);
   if(!eligible.rowCount)throw fail(410,'claim_expired','Navbat kodi muddati tugagan yoki ishlatilgan.');
   await c.query(`UPDATE walkin_manual_claims SET customer_id=$2,consent_at=clock_timestamp(),
    claim_hash=NULL,claim_expires_at=NULL,updated_at=clock_timestamp()
    WHERE entry_id=$1`,[entry_id,owner.customerId]);
   // Explicitly agreeing to receive *in-app* offers does not grant Telegram consent.
   return {linked:true,entry_id:Number(entry_id),offers_enabled:true};
  });
 }
 async function mine({actor}){
  const owner=customerActor(actor);
  // A signed but stale session must not read live manual queue information
  // after the account is deactivated. Hold both identity locks until COMMIT.
  return transaction(db,async c=>{
   await assertCustomer(c,owner);
   const r=await c.query(`SELECT q.id,q.barber_id,q.queue_date,q.status,q.queue_position,
    f.id AS offer_id,f.status AS offer_status,f.expires_at,o.start_at,
    (f.decided_at+interval '2 minutes') AS confirmation_deadline,
    (f.status='pending' AND f.expires_at>clock_timestamp()) AS pending_valid,
    (f.status='accepted' AND f.decided_at+interval '2 minutes'>clock_timestamp()) AS accepted_valid
    FROM walkin_manual_claims m JOIN walkin_queue q ON q.id=m.entry_id
    LEFT JOIN LATERAL (SELECT f.id,f.status,f.expires_at,f.decided_at,f.opening_id
      FROM smart_booking_offers f WHERE f.entry_id=q.id AND f.status IN ('pending','accepted')
        ORDER BY f.id DESC LIMIT 1) f ON TRUE
    LEFT JOIN smart_booking_openings o ON o.id=f.opening_id
    WHERE m.customer_id=$1 AND m.consent_at IS NOT NULL
      AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
      AND q.status IN ('waiting','called','arrived','in_service')
    ORDER BY q.id DESC LIMIT 10`,[owner.customerId]);
   return {entries:r.rows.map(x=>({
    id:Number(x.id),barber_id:x.barber_id,status:x.status,queue_position:x.queue_position,
    smart_offer:x.status==='waiting' && x.offer_id && (x.pending_valid===true||x.accepted_valid===true)
     ?{id:Number(x.offer_id),status:x.offer_status,starts_at:x.start_at,expires_at:x.expires_at,
       confirmation_deadline:x.offer_status==='accepted'?x.confirmation_deadline:null}:null
   }))};
  });
 }
 async function revoke({actor,entry_id}){
  const owner=customerActor(actor),id=positive(entry_id);
  if(!id)throw fail(400,'invalid_entry','Navbat ID noto‘g‘ri.');
  return transaction(db,async c=>{
   await assertCustomer(c,owner);
   const r=await c.query(`SELECT q.barber_id FROM walkin_queue q JOIN walkin_manual_claims m ON m.entry_id=q.id
    WHERE q.id=$1 AND m.customer_id=$2 AND m.consent_at IS NOT NULL`,[id,owner.customerId]);
   if(!r.rowCount)throw fail(404,'not_linked','Faol bog‘langan navbat topilmadi.');
   await lockBarber(c,r.rows[0].barber_id);
   const linked=await c.query(`SELECT q.id FROM walkin_queue q JOIN walkin_manual_claims m ON m.entry_id=q.id
    WHERE q.id=$1 AND m.customer_id=$2 AND m.consent_at IS NOT NULL
    FOR UPDATE OF q,m`,[id,owner.customerId]);
   if(!linked.rowCount)throw fail(404,'not_linked','Faol bog‘langan navbat topilmadi.');
   // Revoke cannot cancel an already booked appointment; the queue link remains
   // separate from confirmed booking ownership.
   const accepted=await c.query(`SELECT f.id,f.opening_id FROM smart_booking_offers f
    LEFT JOIN smart_booking_confirmations x ON x.offer_id=f.id
    WHERE f.entry_id=$1 AND f.status IN ('pending','accepted') AND x.offer_id IS NULL`,[id]);
   for(const f of accepted.rows){
    await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp(),
       updated_at=clock_timestamp() WHERE id=$1 AND state IN ('offered','accepted')`,[f.opening_id]);
    await c.query(`UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp()
       WHERE id=$1 AND status IN ('pending','accepted')`,[f.id]);
    await c.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled'
       WHERE offer_id=$1 AND status='pending'`,[f.id]);
   }
   await c.query(`UPDATE walkin_manual_claims SET customer_id=NULL,consent_at=NULL,
     claim_hash=NULL,claim_expires_at=NULL,updated_at=clock_timestamp()
     WHERE entry_id=$1`,[id]);
   return {linked:false};
  });
 }
 return {issue,claim,mine,revoke};
}
module.exports={createManualQueueClaims,customerActor,ownedEntry,digest,isCode};
