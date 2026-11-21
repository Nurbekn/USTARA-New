'use strict';
const crypto=require('node:crypto');
const isToken=s=>typeof s==='string'&&/^[a-f0-9]{48}$/.test(s);
const isKey=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const tokenHash=s=>digest(`ustara-walkin-qr-v22:${s}`);
const requestHash=s=>digest(`ustara-walkin-request-v22:${s}`);
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const positive=v=>{const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null;};
const ACTIONS=['accept','reject','cancel'];
const isLive=row=>row?.status==='pending' && new Date(row.expires_at).getTime()>Date.now();
const safeOffer=row=>row?{id:Number(row.id),status:row.status,starts_at:row.start_at,
 expires_at:row.expires_at,accepted:row.status==='accepted'}:null;
// The offer is an invitation to arrange earlier service, NOT a booking reservation.
async function transaction(db,fn){
 const client=await db.connect();let active=false,broken=false;
 try{
  await client.query('BEGIN');active=true;
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const result=await fn(client);
  // A lost COMMIT response is not proof of failure: the server may have committed.
  // Never reuse this connection or automatically retry a non-idempotent operation.
  try { await client.query('COMMIT');active=false;return result; }
  catch(e){
   broken=true;
   if(e && typeof e==='object')e.commitUncertain=true;
   throw e;
  }
 }catch(e){
  if(active&&!broken)try{await client.query('ROLLBACK');}catch{broken=true;}
  throw e;
 }
 finally{client.release(broken);}
}
async function lockBarber(c,id){await c.query('SELECT pg_advisory_xact_lock($1)',[id]);}
async function databaseNow(c){
 const r=await c.query('SELECT clock_timestamp() AS db_now');
 const n=new Date(r.rows[0]?.db_now).getTime();
 if(!Number.isFinite(n))throw fail(503,'db_clock_unavailable','Database vaqtini tekshirib bo‘lmadi.');
 return n;
}
async function slotIsTaken(c,opening){
 const q=await c.query(`SELECT EXISTS(SELECT 1 FROM bookings b
  WHERE b.barber_id=$1 AND b.status IN ('pending','confirmed')
  AND tstzrange(b.booking_time,b.booking_time + b.duration_minutes*interval '1 minute','[)')
   && tstzrange($2::timestamptz,$2::timestamptz + $3::int*interval '1 minute','[)')) AS taken`,
  [opening.barber_id,opening.start_at,opening.duration_minutes]);
 return q.rows[0]?.taken===true;
}
// Cancel only unsent notices. Sent or uncertain Telegram deliveries remain
// auditable because an already-in-flight network call cannot be recalled.
async function cancelPendingOfferNotices(c, openingId){
 await c.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled',
   lease_owner=NULL,lease_until=NULL
   WHERE status='pending' AND offer_id IN
    (SELECT id FROM smart_booking_offers WHERE opening_id=$1)`,[openingId]);
}
function createSmartBookingOffers(db){
 db=db||require('../db');
 async function tick(){
  return transaction(db,async c=>{
   // This worker runs one opportunity at a time. Next-check avoids starvation
   // when an open opportunity has no candidate yet.
   const due=await c.query(`SELECT id,barber_id FROM smart_booking_openings
    WHERE state IN ('open','offered','accepted') AND next_check_at<=clock_timestamp()
    ORDER BY next_check_at,id LIMIT 1`);
   if(!due.rowCount)return {kind:'idle'};
   const id=due.rows[0].id,barberId=due.rows[0].barber_id;
   await lockBarber(c,barberId);
   const locked=await c.query(`SELECT * FROM smart_booking_openings
    WHERE id=$1 AND barber_id=$2 AND state IN ('open','offered','accepted')
       AND clock_timestamp()>=next_check_at FOR UPDATE`,[id,barberId]);
   // Another worker may have advanced next_check_at while we waited for
   // its advisory lock. Never process a now-future opening early.
   if(!locked.rowCount)return {kind:'raced'};
   const opening=locked.rows[0];
   const now=await databaseNow(c);
   // A v26 'accepted' response is only provisional. Release it after 2 minutes
   // unless an authenticated customer completed an actual booking.
   if(opening.state==='accepted'){
    const accepted=await c.query(`SELECT f.id,f.decided_at FROM smart_booking_offers f
     WHERE f.opening_id=$1 AND f.status='accepted'
       AND NOT EXISTS(SELECT 1 FROM smart_booking_confirmations x WHERE x.offer_id=f.id)
     ORDER BY f.id DESC LIMIT 1 FOR UPDATE OF f`,[id]);
    if(accepted.rowCount){
     const deadline=new Date(accepted.rows[0].decided_at).getTime()+120000;
     if(deadline>now){
      await c.query(`UPDATE smart_booking_openings SET next_check_at=$2,updated_at=clock_timestamp()
       WHERE id=$1`,[id,new Date(deadline).toISOString()]);
      return {kind:'confirmation_waiting'};
     }
     await c.query(`UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp()
      WHERE id=$1 AND status='accepted'`,[accepted.rows[0].id]);
     await cancelPendingOfferNotices(c,id);
     await c.query(`UPDATE smart_booking_openings SET state='open',updated_at=clock_timestamp() WHERE id=$1`,[id]);
    }else{
     await cancelPendingOfferNotices(c,id);
     await c.query("UPDATE smart_booking_openings SET state='closed',updated_at=clock_timestamp() WHERE id=$1",[id]);
     return {kind:'confirmed_or_closed'};
    }
   }
   if(new Date(opening.start_at).getTime()<=now+5*60000 || await slotIsTaken(c,opening)){
    await c.query(`UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp()
     WHERE opening_id=$1 AND status='pending'`,[id]);
    await cancelPendingOfferNotices(c,id);
    await c.query("UPDATE smart_booking_openings SET state='closed',updated_at=clock_timestamp() WHERE id=$1",[id]);
    return {kind:'closed'};
   }
   const active=await c.query(`SELECT id,expires_at FROM smart_booking_offers
    WHERE opening_id=$1 AND status='pending' FOR UPDATE`,[id]);
   if(active.rowCount){
    if(new Date(active.rows[0].expires_at).getTime()>now){
     await c.query(`UPDATE smart_booking_openings SET next_check_at=$2,updated_at=clock_timestamp() WHERE id=$1`,[id,active.rows[0].expires_at]);
     return {kind:'waiting'};
    }
    await c.query(`UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp()
      WHERE id=$1 AND status='pending'`,[active.rows[0].id]);
    await cancelPendingOfferNotices(c,id);
   }
   // v159: hold a shared lock through the final INSERT, so an Admin pause
   // cannot commit while a new invitation is being created. Pause affects
   // ONLY new offers; existing pending/accepted offers still age normally.
   const policy=await c.query('SELECT enabled FROM smart_booking_admin_settings WHERE id=1 FOR SHARE');
   if(policy.rowCount!==1 || typeof policy.rows[0]?.enabled!=='boolean')
    throw fail(503,'smart_booking_policy_unavailable','Smart Booking qoidasi mavjud emas.');
   if(!policy.rows[0].enabled){
    await c.query(`UPDATE smart_booking_openings SET next_check_at=clock_timestamp()+interval '30 seconds',
      updated_at=clock_timestamp() WHERE id=$1 AND state IN ('open','offered')`,[id]);
    return {kind:'paused'};
   }
   const candidate=await c.query(`SELECT q.id FROM walkin_queue q
     LEFT JOIN walkin_qr_requests r ON r.queue_entry_id=q.id AND r.status='approved'
     LEFT JOIN walkin_manual_claims m ON m.entry_id=q.id AND m.customer_id IS NOT NULL AND m.consent_at IS NOT NULL
       AND EXISTS(SELECT 1 FROM customers c JOIN users u ON u.id=c.user_id
         WHERE c.id=m.customer_id AND u.role='customer' AND u.deactivated_at IS NULL)
     WHERE (r.queue_entry_id IS NOT NULL OR m.entry_id IS NOT NULL)
       AND q.barber_id=$1 AND q.status='waiting'
       AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
       AND NOT EXISTS(SELECT 1 FROM smart_booking_offers o WHERE o.opening_id=$2 AND o.entry_id=q.id)
       AND NOT EXISTS(SELECT 1 FROM smart_booking_offers o WHERE o.entry_id=q.id AND o.status IN ('pending','accepted'))
     ORDER BY q.queue_position ASC NULLS LAST,q.id LIMIT 1 FOR UPDATE OF q`,[barberId,id]);
   if(!candidate.rowCount){
    await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE id=$1`,[id]);
    return {kind:'no_candidate'};
   }
   // v53: the candidate lookup may be slow. The definitive OFFER INSERT
   // must still be at least five minutes before the appointment starts.
   const created=await c.query(`INSERT INTO smart_booking_offers(opening_id,entry_id,expires_at)
     SELECT o.id,q.id,clock_timestamp()+interval '5 minutes'
     FROM smart_booking_openings o JOIN walkin_queue q ON q.id=$2
     WHERE o.id=$1 AND o.state IN ('open','offered')
       AND o.start_at>clock_timestamp()+interval '5 minutes'
       AND q.barber_id=o.barber_id AND q.status='waiting'
       AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
     RETURNING id,expires_at`,[id,candidate.rows[0].id]);
   if(created.rowCount!==1){
    await c.query(`UPDATE smart_booking_openings SET state='closed',updated_at=clock_timestamp()
       WHERE id=$1 AND state IN ('open','offered')`,[id]);
    return {kind:'closed'};
   }
   await c.query(`UPDATE smart_booking_openings SET state='offered',next_check_at=$2,updated_at=clock_timestamp() WHERE id=$1`,[id,created.rows[0].expires_at]);
   // v30: A waiting ticket cannot receive a second offer during the accepted
   // confirmation grace period; partial UNIQUE index also enforces it in PG.
   // Only explicit SECOND consent allows Telegram offer notices. Original
   // queue-call subscription must not silently opt in to this new purpose.
   await c.query(`INSERT INTO smart_booking_telegram_outbox(offer_id,chat_id)
     SELECT $1,s.chat_id FROM walkin_queue_telegram_subscriptions s
     WHERE s.entry_id=$2 AND s.offers_consent_at IS NOT NULL
     ON CONFLICT(offer_id) DO NOTHING`,[created.rows[0].id,candidate.rows[0].id]);
   return {kind:'offered',offer_id:created.rows[0].id};
  });
 }
 async function applyDecision(c,{entry_id,barber_id},id,action,proof=null){
   await lockBarber(c,barber_id);
   const found=await c.query(`SELECT o.id AS opening_id,o.barber_id,o.start_at,o.duration_minutes,o.state,
    f.id,f.status,f.expires_at,f.decided_at,q.status AS queue_status,
    (q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date) AS queue_today
    FROM smart_booking_offers f JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    WHERE f.id=$1 AND f.entry_id=$2 AND o.barber_id=$3
    FOR UPDATE OF o,f,q`,[id,entry_id,barber_id]);
   if(!found.rowCount)throw fail(404,'offer_missing','Taklif topilmadi.');
   const f=found.rows[0];
   // Re-check ownership AFTER locking the offer and queue row. The original
   // check ran before waiting for the barber lock; consent may have changed.
   if(proof?.type==='qr'){
    const live=await c.query(`SELECT 1 FROM walkin_qr_requests r
      JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
      WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.queue_entry_id=$3
        AND r.status='approved' FOR SHARE OF r`,
      [proof.token_hash,proof.request_hash,entry_id]);
    if(!live.rowCount)throw fail(403,'ticket_revoked','QR navbat tasdig‘i bekor qilingan.');
   }
   if(proof?.type==='telegram'){
    // A fresh consent after /stopqueue must NOT reactivate a button from an
    // earlier Telegram message. Take a share lock to serialize with opt-out.
    const live=await c.query(`SELECT 1 FROM smart_booking_telegram_outbox t
      JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=$1 AND s.chat_id=t.chat_id
      WHERE t.offer_id=$2 AND t.chat_id=$3 AND t.telegram_message_id=$4
        AND t.status='sent' AND t.sent_at IS NOT NULL
        AND s.offers_consent_at IS NOT NULL
        AND s.offers_consent_at<=t.created_at
      FOR SHARE OF s,t`,[entry_id,id,proof.chat,proof.mid]);
    if(!live.rowCount)throw fail(403,'callback_revoked','Telegram taklifiga berilgan rozilik bekor qilingan.');
   }
   const now=await databaseNow(c);
   const next=action==='accept'?'accepted':action==='reject'?'rejected':'cancelled';
   // An accepted invitation is only provisional for TWO minutes. If the
   // worker has not yet expired it, a late repeated callback must not report
   // success. A completed booking remains idempotently accepted, however.
   if(f.status==='accepted' && action==='accept' &&
      new Date(f.decided_at).getTime()+120000<=now){
    const confirmed=await c.query('SELECT 1 FROM smart_booking_confirmations WHERE offer_id=$1',[id]);
    if(!confirmed.rowCount){
     await c.query("UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp() WHERE id=$1 AND status='accepted'",[id]);
     await cancelPendingOfferNotices(c,f.opening_id);
     if(f.state==='accepted'){
      await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp(),
        updated_at=clock_timestamp() WHERE id=$1 AND state='accepted'`,[f.opening_id]);
     }
     return {httpStatus:410,code:'confirmation_expired',offer:safeOffer({...f,id,status:'expired'})};
    }
   }
   // A yesterday ticket cannot accept or replay a provisional invitation.
   // Confirmed bookings are managed separately and are not deleted here.
   if(f.queue_today!==true){
    // An already completed booking remains idempotent, even after midnight.
    // Do not turn a real booking into a stale-ticket error on a retry.
    if(f.status==='accepted' && action==='accept'){
     const booked=await c.query('SELECT 1 FROM smart_booking_confirmations WHERE offer_id=$1',[id]);
     if(booked.rowCount)return {offer:safeOffer({...f,id,status:'accepted'}),replayed:true};
    }
    if(f.status==='pending'){
     await c.query("UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp() WHERE id=$1 AND status='pending'",[id]);
     await cancelPendingOfferNotices(c,f.opening_id);
    }
    return {httpStatus:410,code:'ticket_expired',offer:safeOffer({...f,id,status:'expired'})};
   }
   if(f.status===next)return {offer:safeOffer({...f,id,status:next}),replayed:true};
   if(f.status==='accepted' && action==='cancel'){
    const booked=await c.query('SELECT 1 FROM smart_booking_confirmations WHERE offer_id=$1',[id]);
    if(booked.rowCount)throw fail(409,'already_booked','Tasdiqlangan bronni Bronlar sahifasidan boshqaring.');
    await c.query(`UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp() WHERE id=$1`,[id]);
    await cancelPendingOfferNotices(c,f.opening_id);
    await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[f.opening_id]);
    return {offer:safeOffer({...f,id,status:'cancelled'}),replayed:false};
   }
   if(f.status!=='pending')throw fail(409,'already_decided','Taklif bo‘yicha qaror berilgan.');
   if(new Date(f.expires_at).getTime()<=now || f.queue_status!=='waiting' || f.state!=='offered' ||
      new Date(f.start_at).getTime()<=now+5*60000){
    await c.query("UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp() WHERE id=$1",[id]);
    await cancelPendingOfferNotices(c,f.opening_id);
    await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`,[f.opening_id]);
    return {httpStatus:410,code:'offer_expired',offer:safeOffer({...f,id,status:'expired'})};
   }
   if(action==='accept' && await slotIsTaken(c,f)){
    await c.query("UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp() WHERE id=$1",[id]);
    await cancelPendingOfferNotices(c,f.opening_id);
    await c.query("UPDATE smart_booking_openings SET state='closed',updated_at=clock_timestamp() WHERE id=$1",[f.opening_id]);
    return {httpStatus:409,code:'slot_taken',offer:safeOffer({...f,id,status:'cancelled'})};
   }
   // v52: after slow slot checks, expire the invitation AT the final write.
   // Queue/day and opening must still be live, not merely live at the snapshot.
   const decided=await c.query(`UPDATE smart_booking_offers f
      SET status=$2,decided_at=clock_timestamp()
      WHERE f.id=$1 AND f.status='pending' AND f.expires_at>clock_timestamp()
        AND EXISTS (SELECT 1 FROM smart_booking_openings o
          JOIN walkin_queue q ON q.id=f.entry_id
          WHERE o.id=f.opening_id AND o.state='offered'
            AND o.start_at>clock_timestamp()+interval '5 minutes'
            AND q.status='waiting'
            AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date)
      RETURNING f.id`,[id,next]);
   if(decided.rowCount!==1){
    await c.query(`UPDATE smart_booking_offers SET status='expired',decided_at=clock_timestamp()
      WHERE id=$1 AND status='pending'`,[id]);
    await cancelPendingOfferNotices(c,f.opening_id);
    await c.query(`UPDATE smart_booking_openings SET state='open',next_check_at=clock_timestamp(),
      updated_at=clock_timestamp() WHERE id=$1 AND state='offered'`,[f.opening_id]);
    return {httpStatus:410,code:'offer_expired',offer:safeOffer({...f,id,status:'expired'})};
   }
   await c.query("UPDATE smart_booking_telegram_outbox SET status='cancelled' WHERE offer_id=$1 AND status='pending'",[id]);
   // v53: do not schedule confirmation from the earlier dbNow snapshot.
   // Derive the two-minute deadline from the actual offer decision write.
   await c.query(`UPDATE smart_booking_openings
     SET state=$2,next_check_at=CASE WHEN $2='accepted'
        THEN (SELECT decided_at+interval '2 minutes' FROM smart_booking_offers WHERE id=$3)
        ELSE clock_timestamp() END,updated_at=clock_timestamp()
     WHERE id=$1`,[f.opening_id,next==='accepted'?'accepted':'open',id]);
   return {offer:safeOffer({...f,id,status:next}),replayed:false};
 }
 async function decide({token,request_id,offer_id,action}){
  if(!isToken(token)||!isKey(request_id))throw fail(400,'invalid_ticket','QR maʼlumoti noto‘g‘ri.');
  const id=positive(offer_id);
  if(!id||!ACTIONS.includes(action))throw fail(400,'invalid_offer_action','Taklif amali noto‘g‘ri.');
  return transaction(db,async c=>{
   const owner=await c.query(`SELECT q.id AS entry_id,q.barber_id FROM walkin_qr_requests r
    JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    JOIN walkin_queue q ON q.id=r.queue_entry_id
    WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'`,
    [tokenHash(token),requestHash(request_id)]);
   if(!owner.rowCount)throw fail(404,'ticket_missing','QR navbat topilmadi.');
   return applyDecision(c,owner.rows[0],id,action,{
     type:'qr',token_hash:tokenHash(token),request_hash:requestHash(request_id)});
  });
 }
 async function decideByCustomer({offer_id,action,actor}){
  const {customerActor,ownedEntry}=require('./manualQueueClaims');
  const owner=customerActor(actor),id=positive(offer_id);
  if(!id||!ACTIONS.includes(action))throw fail(400,'invalid_offer_action','Taklif amali noto‘g‘ri.');
  return transaction(db,async c=>{
   const account=await c.query(`SELECT c.id FROM customers c JOIN users u ON u.id=c.user_id
    WHERE c.id=$1 AND c.user_id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
    FOR SHARE OF c,u`,[owner.customerId,owner.userId]);
   // Hold the identity read-lock through the decision COMMIT. If account
   // deactivation wins first, this transaction cannot accept a stale session;
   // if this decision wins first, deactivation waits for its COMMIT.
   if(!account.rowCount)throw fail(401,'invalid_session','Mijoz sessiyasi yaroqsiz.');
   const ticket=await ownedEntry(c,id,owner.customerId);
   await lockBarber(c,ticket.barber_id);
   // Consent may be revoked while waiting for the barber lock. The second
   // read MUST lock the claim row until COMMIT, so revoke cannot race between
   // this check and the offer status update in applyDecision().
   await ownedEntry(c,id,owner.customerId,{locked:true});
   return applyDecision(c,ticket,id,action);
  });
 }
 async function decideByTelegram({offer_id,action,chat_id,message_id}){
  const id=positive(offer_id),mid=positive(message_id);
  const chat=typeof chat_id==='number'||typeof chat_id==='string'?String(chat_id):'';
  // Telegram private-chat identifiers are PostgreSQL BIGINT values.
  // Reject overflow before handing attacker-supplied data to the SQL driver.
  if(!id||!mid||!['accept','reject'].includes(action)||!/^[1-9]\d{0,18}$/.test(chat)
    ||BigInt(chat)>9223372036854775807n)
   throw fail(400,'invalid_callback','Telegram tugmasi noto‘g‘ri.');
  return transaction(db,async c=>{
   const linked=await c.query(`SELECT q.id AS entry_id,q.barber_id FROM smart_booking_telegram_outbox o
    JOIN smart_booking_offers f ON f.id=o.offer_id
    JOIN walkin_queue q ON q.id=f.entry_id
    JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id
    WHERE o.offer_id=$1 AND o.chat_id=$2 AND s.chat_id=$2
      AND s.offers_consent_at IS NOT NULL AND s.offers_consent_at<=o.created_at
      AND o.status='sent' AND o.telegram_message_id=$3`,[id,chat,mid]);
   if(!linked.rowCount)throw fail(403,'callback_forbidden','Bu taklif ushbu chatga tegishli emas.');
   return applyDecision(c,linked.rows[0],id,action,{type:'telegram',chat,mid});
  });
 }
 // Verify the current user ID as well as the profile ID. Never trust a
 // barber profile reference alone, even when supplied by a signed session.
 async function activeBarber(c,barberId,userId){
  if(!positive(barberId)||!positive(userId))throw fail(403,'barber_required','Faol sartarosh hisobi kerak.');
  const ok=await c.query(`SELECT b.id FROM barbers b JOIN users u ON u.id=b.user_id
    WHERE b.id=$1 AND b.user_id=$2 AND b.verification_status='approved'
      AND u.role='barber' AND u.deactivated_at IS NULL FOR SHARE OF b,u`,[barberId,userId]);
  if(!ok.rowCount)throw fail(403,'barber_required','Sartarosh hisobi tasdiqlanmagan.');
 }
 async function listForBarber(barberId,userId){
  return transaction(db,async c=>{
   await activeBarber(c,barberId,userId);
   const r=await c.query(`SELECT o.id,o.state,o.start_at,o.duration_minutes,
    f.id AS offer_id,f.status AS offer_status,f.expires_at,q.display_label,
    x.booking_id,t.status AS telegram_notice_status
    FROM smart_booking_openings o
    LEFT JOIN LATERAL (SELECT * FROM smart_booking_offers WHERE opening_id=o.id ORDER BY id DESC LIMIT 1) f ON TRUE
    LEFT JOIN walkin_queue q ON q.id=f.entry_id
    LEFT JOIN smart_booking_confirmations x ON x.offer_id=f.id
    LEFT JOIN smart_booking_telegram_outbox t ON t.offer_id=f.id
    WHERE o.barber_id=$1 AND (o.start_at AT TIME ZONE 'Asia/Tashkent')::date
      =(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    ORDER BY o.start_at,o.id LIMIT 50`,[barberId]);
   return r.rows;
  });
 }
 async function cancelBarber(offerId,barberId,userId){
  const id=positive(offerId);
  if(!id)throw fail(400,'invalid_id','ID noto‘g‘ri.');
  return transaction(db,async c=>{
   // Acquire account identity locks before advisory locks (same as user pause).
   await activeBarber(c,barberId,userId);
   await lockBarber(c,barberId);
   const r=await c.query('SELECT id,state FROM smart_booking_openings WHERE id=$1 AND barber_id=$2 FOR UPDATE',[id,barberId]);
   if(!r.rowCount)throw fail(404,'offer_missing','Taklif topilmadi.');
   if(r.rows[0].state==='cancelled'){
    // Repair pre-existing pending offers/notices on an idempotent replay.
    // Accepted and confirmed bookings remain untouched.
    await c.query("UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp() WHERE opening_id=$1 AND status='pending'",[id]);
    await cancelPendingOfferNotices(c,id);
    return {state:'cancelled',replayed:true};
   }
   if(['accepted','closed'].includes(r.rows[0].state))throw fail(409,'already_closed','Taklif allaqachon yakunlangan.');
   await c.query("UPDATE smart_booking_offers SET status='cancelled',decided_at=clock_timestamp() WHERE opening_id=$1 AND status='pending'",[id]);
   await cancelPendingOfferNotices(c,id);
   await c.query("UPDATE smart_booking_openings SET state='cancelled',updated_at=clock_timestamp() WHERE id=$1",[id]);
   return {state:'cancelled',replayed:false};
  });
 }
 return {tick,decide,decideByCustomer,decideByTelegram,listForBarber,cancelBarber};
}
module.exports={createSmartBookingOffers,isLive,safeOffer,transaction,lockBarber,slotIsTaken,tokenHash,requestHash,fail,positive};
