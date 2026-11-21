'use strict';
// v191: one-shot customer booking Telegram outbox. Never auto-retry an ambiguous send.
const {randomUUID}=require('node:crypto');
const {createTelegramApi,validateSentMessage}=require('../telegram/api');

const EVENT_LABELS=Object.freeze({
  pending:'Bron so‘rovingiz qabul qilindi va ko‘rib chiqilmoqda.',
  confirmed:'Broningiz tasdiqlandi.',
  cancelled:'Broningiz bekor qilindi.',
  rejected:'Bron so‘rovingiz rad etildi.',
  rescheduled:'Broningizning vaqti yoki xizmati o‘zgardi.'
});
function noticeText(kind,bookingId){
  if(!Object.hasOwn(EVENT_LABELS,kind)||!Number.isSafeInteger(Number(bookingId))||Number(bookingId)<=0)
    throw new TypeError('Invalid booking notification');
  return `USTARA · Bron #${bookingId}\n${EVENT_LABELS[kind]}\nOxirgi holatni USTARA ilovasida tekshiring.`;
}
async function transaction(pool,fn){
  const c=await pool.connect();let started=false,broken=false;
  try {
    await c.query('BEGIN');started=true;
    await c.query("SET LOCAL lock_timeout='5s'");
    await c.query("SET LOCAL statement_timeout='20s'");
    const result=await fn(c);
    await c.query('COMMIT');started=false;
    return result;
  }catch(error){if(started)try{await c.query('ROLLBACK');}catch{broken=true;}throw error;}
  finally{c.release(broken);}
}
function createCustomerBookingDispatcher({pool,api,env=process.env}={}){
  if(!pool?.connect)throw new TypeError('PostgreSQL pool required');
  async function step(){
    // Phase 1: claim DURABLY before a network call. A crashed claim becomes
    // uncertain, never queued again, including a lost COMMIT acknowledgement.
    const claimed=await transaction(pool,async c=>{
      await c.query(`UPDATE customer_booking_telegram_outbox
        SET status='uncertain',updated_at=clock_timestamp()
        WHERE status='sending' AND claimed_at<clock_timestamp()-INTERVAL '2 minutes'`);
      const items=await c.query(`SELECT id,booking_id,user_id,event_kind,expected_status,expected_booking_time,expected_duration_minutes,expected_service_id,expected_barber_id
        FROM customer_booking_telegram_outbox WHERE status='queued'
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
      if(!items.rowCount)return null;
      const item=items.rows[0],claim=randomUUID();
      await c.query(`UPDATE customer_booking_telegram_outbox
        SET status='sending',claim_id=$2,claimed_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE id=$1 AND status='queued'`,[item.id,claim]);
      return {...item,claim};
    });
    if(!claimed)return false;
    // Phase 2 holds the account/link/booking share locks through the bounded
    // Telegram request. This serializes opt-out, unlink, suspend and status
    // changes with the actual send decision (max 8s network timeout).
    // If COMMIT fails after Telegram accepted, claim stays 'sending' and later
    // becomes uncertain. It is NEVER retried automatically.
    try{
      await transaction(pool,async c=>{
        const pending=await c.query(`SELECT status FROM customer_booking_telegram_outbox
          WHERE id=$1 AND claim_id=$2 FOR UPDATE`,[claimed.id,claimed.claim]);
        if(pending.rows[0]?.status!=='sending')return;
        const eligible=await c.query(`SELECT l.chat_id
          FROM bookings b JOIN customers p ON p.id=b.customer_id
          JOIN users u ON u.id=p.user_id AND u.role='customer'
          JOIN customer_telegram_links l ON l.user_id=u.id AND l.notification_opt_in_at IS NOT NULL
          WHERE b.id=$1 AND u.id=$2 AND u.deactivated_at IS NULL AND u.admin_suspended_at IS NULL
            AND b.status=$3 AND b.booking_time=$4
            AND b.duration_minutes=$5 AND b.service_id=$6 AND b.barber_id=$7
          FOR SHARE OF b,p,u,l`,[
          claimed.booking_id,claimed.user_id,claimed.expected_status,claimed.expected_booking_time,
          claimed.expected_duration_minutes,claimed.expected_service_id,claimed.expected_barber_id
        ]);
        if(!eligible.rowCount){
          await c.query(`UPDATE customer_booking_telegram_outbox SET status='cancelled',updated_at=clock_timestamp()
            WHERE id=$1 AND claim_id=$2`,[claimed.id,claimed.claim]);return;
        }
        const chatId=String(eligible.rows[0].chat_id);
        let state='uncertain',messageId=null;
        try{
          const send=api||createTelegramApi(env.TELEGRAM_BOT_TOKEN);
          const result=await send('sendMessage',{
            chat_id:chatId,text:noticeText(claimed.event_kind,claimed.booking_id),protect_content:true,
            disable_web_page_preview:true
          },AbortSignal.timeout(8000));
          messageId=validateSentMessage(result,chatId).message_id;
          state='accepted'; // API accepted, NOT delivered/read.
        }catch{ /* Telegram may have accepted a timed-out call; NEVER retry. */ }
        await c.query(`UPDATE customer_booking_telegram_outbox
          SET status=$3,telegram_message_id=$4,updated_at=clock_timestamp()
          WHERE id=$1 AND claim_id=$2 AND status='sending'`,[claimed.id,claimed.claim,state,messageId]);
      });
    }catch{
      // No retry after a durable claim; worker can safely continue later.
      // The stale-claim transition marks the result 'uncertain'.
    }
    return true;
  }
  return {step};
}
module.exports={noticeText,createCustomerBookingDispatcher};
