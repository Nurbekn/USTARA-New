'use strict';
const crypto=require('node:crypto');
const {createTelegramApi,TelegramApiError,validateSentMessage}=require('../telegram/api');
const {telegramRetryDelay}=require('./telegramRetryPolicy');
const displayTime=value=>new Intl.DateTimeFormat('uz-UZ',{
 timeZone:'Asia/Tashkent',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
}).format(new Date(value));
// Unknown send outcome MUST NOT be replayed automatically (may duplicate notices).
function createSmartBookingTelegram({pool,api,env=process.env}){
 const send=api||createTelegramApi(env.TELEGRAM_BOT_TOKEN);
 async function claim(){
  // A manually restored or interrupted attempt-5 pending row must never stay
  // forever in the ready index. No further automatic send is allowed.
  await pool.query(`UPDATE smart_booking_telegram_outbox SET status='failed'
    WHERE status='pending' AND attempts>=5`);
  // Discard unsendable pending rows before claiming a live offer.
  await pool.query(`UPDATE smart_booking_telegram_outbox t SET status='cancelled'
   WHERE t.status='pending' AND NOT EXISTS (
    SELECT 1 FROM smart_booking_offers f JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=t.chat_id
    WHERE f.id=t.offer_id AND f.status='pending' AND o.state='offered'
      AND q.status='waiting' AND f.expires_at>clock_timestamp()
      AND s.offers_consent_at IS NOT NULL AND s.offers_consent_at<=t.created_at
   )`);
  // Expired leases mean that the send may have reached Telegram. No blind retry.
  await pool.query(`UPDATE smart_booking_telegram_outbox SET status='uncertain',lease_owner=NULL,lease_until=NULL
   WHERE status='sending' AND (lease_until IS NULL OR lease_until<clock_timestamp())`);
  const owner=crypto.randomUUID();
  const result=await pool.query(`WITH candidate AS (
    SELECT t.id FROM smart_booking_telegram_outbox t
    JOIN smart_booking_offers f ON f.id=t.offer_id
    JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=t.chat_id
    WHERE t.status='pending' AND t.next_attempt_at<=clock_timestamp() AND t.attempts<5
      AND f.status='pending' AND f.expires_at>clock_timestamp()+interval '20 seconds'
      AND o.state='offered' AND q.status='waiting'
      AND s.offers_consent_at IS NOT NULL AND s.offers_consent_at<=t.created_at
    ORDER BY t.next_attempt_at,t.id FOR UPDATE OF t SKIP LOCKED LIMIT 1
  ) UPDATE smart_booking_telegram_outbox t
  SET status='sending',attempts=t.attempts+1,lease_owner=$1::uuid,
      lease_until=clock_timestamp()+interval '40 seconds'
  FROM candidate x WHERE t.id=x.id RETURNING t.id,t.offer_id,t.chat_id,t.attempts`,[owner]);
  return result.rows[0]?{...result.rows[0],owner}:null;
 }
 async function step(){
  const job=await claim();if(!job)return false;
  const current=await pool.query(`SELECT f.expires_at,o.start_at FROM smart_booking_telegram_outbox t
    JOIN smart_booking_offers f ON f.id=t.offer_id
    JOIN smart_booking_openings o ON o.id=f.opening_id
    JOIN walkin_queue q ON q.id=f.entry_id
    JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=t.chat_id
    WHERE t.id=$1 AND t.lease_owner=$2::uuid AND t.status='sending' AND t.chat_id=$3
      AND f.status='pending' AND o.state='offered' AND q.status='waiting'
      AND f.expires_at>clock_timestamp()+interval '15 seconds'
      AND s.offers_consent_at IS NOT NULL AND s.offers_consent_at<=t.created_at`,[job.id,job.owner,job.chat_id]);
  if(!current.rowCount){
   await pool.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2::uuid AND status='sending'`,[job.id,job.owner]);return true;
  }
  try{
   const sent=validateSentMessage(await send('sendMessage',{
     chat_id:String(job.chat_id),protect_content:true,
     text:`USTARA: ${displayTime(current.rows[0].start_at)} uchun bo‘sh vaqt taklifi. Taklif 5 daqiqa amal qiladi. Qabul qilish bronni avtomatik yaratmaydi; 2 daqiqada tasdiqlash uchun saytdagi QR navbat yoki «Oddiy navbatim» sahifasida mijoz hisobingizga kiring. Xabarlarni to‘xtatish: /stopqueue`,
     reply_markup:{inline_keyboard:[[{
       text:'Qabul qilish',callback_data:`so:a:${job.offer_id}`
     },{text:'Rad etish',callback_data:`so:r:${job.offer_id}`}]]},
   },AbortSignal.timeout(20000)),job.chat_id);
   await pool.query(`UPDATE smart_booking_telegram_outbox SET status='sent',sent_at=clock_timestamp(),
      telegram_message_id=$3,lease_owner=NULL,lease_until=NULL
      WHERE id=$1 AND lease_owner=$2::uuid AND status='sending'`,[job.id,job.owner,sent.message_id]);
  }catch(e){
   const limited=e instanceof TelegramApiError && e.code===429;
   const permanent=e instanceof TelegramApiError && [400,401,403].includes(e.code);
   const delay=limited?telegramRetryDelay(Number(job.attempts),e.retryAfter):null;
   const final=permanent||Number(job.attempts)>=5||limited&&delay===null;
   const state=limited?(final?'failed':'pending'):permanent?'failed':'uncertain';
   await pool.query(`UPDATE smart_booking_telegram_outbox
     SET status=$3,next_attempt_at=clock_timestamp()+($4::int*interval '1 second'),
       lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2::uuid AND status='sending'`,
     [job.id,job.owner,state,state==='pending'?delay:0]);
  }
  return true;
 }
 return {claim,step};
}
module.exports={createSmartBookingTelegram,displayTime};
