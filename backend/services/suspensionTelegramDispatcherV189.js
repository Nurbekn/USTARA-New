'use strict';
// The worker is started explicitly by an operator. One request per case; no auto-retries.
const {randomUUID}=require('node:crypto');
const {createTelegramApi}=require('../telegram/api');

// A short generic message: never include names, phone numbers, account status or suspension reason.
function noticeText(bookingId){
 return `USTARA: #${bookingId} bron bo‘yicha Admin bilan bog‘lanish talab qilinadi. Bron holatini USTARA orqali tekshiring. Bu xabar bron bekor qilinganini bildirmaydi.`;
}
async function transaction(pool,work){
 const client=await pool.connect();let broken=false,started=false;
 try{
  await client.query('BEGIN');started=true;
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const value=await work(client);
  await client.query('COMMIT');started=false;return value;
 }catch(err){if(started)try{await client.query('ROLLBACK');}catch{broken=true;}throw err;}
 finally{client.release(broken);}
}
function createDispatcher({pool,api,env=process.env}={}){
 if(!pool?.connect)throw new TypeError('PostgreSQL pool required');
 // Don't create the API until a row is claimed. Missing configuration cannot be hidden as success.
 const send=api||null;
 async function step(){
  // Sending older than 2 min is AMBIGUOUS: may have been accepted before worker crash.
  // Never automatically requeue it.
  const claimed=await transaction(pool,async c=>{
   await c.query(`UPDATE admin_suspension_telegram_notices SET status='uncertain',updated_at=clock_timestamp()
     WHERE status='sending' AND claimed_at<clock_timestamp()-INTERVAL '2 minutes'`);
   const waiting=await c.query(`SELECT id,case_id FROM admin_suspension_telegram_notices
     WHERE status='queued' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1`);
   if(!waiting.rowCount)return null;
   const entry=waiting.rows[0];
   const eligibility=await c.query(`SELECT c.status AS case_status,b.id AS booking_id,b.status AS booking_status,
      (b.booking_time+b.duration_minutes*INTERVAL '1 minute'>clock_timestamp()) AS booking_future,
      u.role AS suspended_role,u.admin_suspended_at,
      p.admin_suspended_at AS barber_suspended_at,p.deactivated_at AS barber_deactivated_at,l.chat_id
      FROM admin_suspension_booking_cases c
      JOIN admin_account_suspension_events e ON e.id=c.suspension_event_id
      JOIN users u ON u.id=e.user_id
      JOIN bookings b ON b.id=c.booking_id
      JOIN barbers r ON r.id=b.barber_id
      JOIN users p ON p.id=r.user_id AND p.role='barber'
      LEFT JOIN barber_telegram_links l ON l.barber_id=r.id
      WHERE c.id=$1 FOR SHARE OF c,b,u,p`,[entry.case_id]);
   const r=eligibility.rows[0];
   const eligible=r&&['reviewed','attempted'].includes(r.case_status)&&
     ['pending','confirmed'].includes(r.booking_status)&&r.booking_future===true&&
     r.suspended_role==='customer'&&r.admin_suspended_at!=null&&
     r.barber_suspended_at==null&&r.barber_deactivated_at==null&&r.chat_id!=null;
   if(!eligible){
    await c.query(`UPDATE admin_suspension_telegram_notices SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1`,[entry.id]);
    return {cancelled:true};
   }
   const claim=randomUUID();
   await c.query(`UPDATE admin_suspension_telegram_notices
     SET status='sending',claim_id=$2,claimed_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=$1 AND status='queued'`,[entry.id,claim]);
   return {id:entry.id,claim,chatId:String(r.chat_id),bookingId:r.booking_id};
  });
  if(!claimed)return false;
  if(claimed.cancelled)return true;
  let outcome='uncertain',messageId=null;
  try{
   const apiCall=send||createTelegramApi(env.TELEGRAM_BOT_TOKEN);
   const delivered=await apiCall('sendMessage',{chat_id:claimed.chatId,text:noticeText(claimed.bookingId),protect_content:true},AbortSignal.timeout(8000));
   // Test doubles must obey the same response contract as the real Telegram API.
   const {validateSentMessage}=require('../telegram/api');
   const verified=validateSentMessage(delivered,claimed.chatId);
   messageId=verified.message_id;
   outcome='accepted'; // Telegram API accepted it; NOT a device-delivery or read receipt.
  }catch{
   // Even a timeout might have been accepted by Telegram; no retry.
  }
  try{
   await pool.query(`UPDATE admin_suspension_telegram_notices
     SET status=$3,telegram_message_id=$4,updated_at=clock_timestamp()
     WHERE id=$1 AND claim_id=$2 AND status='sending'`,[claimed.id,claimed.claim,outcome,messageId]);
  }catch{
   // The claim is left 'sending' and will expire into 'uncertain', never requeued.
  }
  return true;
 }
 return {step};
}
module.exports={noticeText,createDispatcher};
