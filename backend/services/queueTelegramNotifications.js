'use strict';
const crypto = require('node:crypto');
const { telegramId } = require('../telegram/identity');
const { createTelegramApi, TelegramApiError, validateSentMessage } = require('../telegram/api');
const {telegramRetryDelay}=require('./telegramRetryPolicy');
const digest = token => crypto.createHash('sha256').update('ustara-queue-telegram-v25:' + token).digest('hex');
const qrDigest = token => crypto.createHash('sha256').update('ustara-walkin-qr-v22:' + token).digest('hex');
const requestDigest = token => crypto.createHash('sha256').update('ustara-walkin-request-v22:' + token).digest('hex');
const invalid = (status,code,message)=>Object.assign(new Error(message),{status,code});
const isQr = token=>typeof token==='string'&&/^[a-f0-9]{48}$/.test(token);
const isKey = token=>typeof token==='string'&&/^[a-f0-9]{32}$/.test(token);
const isInvite = token=>typeof token==='string'&&/^[a-f0-9]{48}$/.test(token);
async function transaction(db, action) {
 const client=await db.connect();let begun=false,broken=false;
 try {
  await client.query('BEGIN');begun=true;
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const result=await action(client);
  await client.query('COMMIT');begun=false;return result;
 } catch(e){if(begun)try{await client.query('ROLLBACK');}catch{broken=true;}throw e;}
 finally{client.release(broken);}
}
// No phone/Telegram identity is inferred from the QR; holder explicitly requests a one-time link.
function createQueueTelegramService({pool,env=process.env}){
 async function issue(qrToken,requestId){
  if(!isQr(qrToken)||!isKey(requestId))throw invalid(400,'invalid_ticket','QR so‘rovi noto‘g‘ri.');
  if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(env.TELEGRAM_BOT_USERNAME||''))
   throw invalid(503,'telegram_unavailable','Telegram xabarnomalari hozircha yoqilmagan.');
  return transaction(pool,async client=>{
   const found=await client.query(`SELECT q.id,q.status,q.queue_date
    FROM walkin_qr_requests r JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    JOIN walkin_queue q ON q.id=r.queue_entry_id
    WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'
      AND q.status='waiting'
      AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    FOR UPDATE OF q`,[qrDigest(qrToken),requestDigest(requestId)]);
   const ticket=found.rows[0];
   if(!ticket || ticket.status!=='waiting')
     throw invalid(409,'ticket_not_waiting','Telegramga ulash faqat bugungi kutayotgan navbat uchun mumkin.');
   const linked=await client.query('SELECT 1 FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1',[ticket.id]);
   if(linked.rowCount)throw invalid(409,'already_linked','Telegram allaqachon ulangan. Avval eski ulanishni uzing.');
   const existing=await client.query(`SELECT (created_at>clock_timestamp()-interval '1 minute') AS rate_limited
    FROM walkin_queue_telegram_invites WHERE entry_id=$1 FOR UPDATE`,[ticket.id]);
   if(existing.rowCount && existing.rows[0].rate_limited===true)
     throw invalid(429,'invite_rate_limit','Yangi havola olishdan oldin bir daqiqa kuting.');
   const token=crypto.randomBytes(24).toString('hex');
   await client.query(`INSERT INTO walkin_queue_telegram_invites(entry_id,token_hash,created_at,expires_at,consumed_at)
    VALUES($1,$2,clock_timestamp(),clock_timestamp()+interval '5 minutes',NULL)
    ON CONFLICT(entry_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=EXCLUDED.created_at,
    expires_at=EXCLUDED.expires_at,consumed_at=NULL`,[ticket.id,digest(token)]);
   return {url:`https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=qnotify_${token}`,expires_in_seconds:300};
  });
 }
 async function consume(token,chat){
  const id=telegramId(chat);
  if(!isInvite(token)||!id)throw invalid(400,'invalid_invite','Havola noto‘g‘ri.');
  return transaction(pool,async client=>{
   const found=await client.query(`SELECT i.entry_id,i.expires_at,i.consumed_at,q.status,q.queue_date
    FROM walkin_queue_telegram_invites i JOIN walkin_queue q ON q.id=i.entry_id
    WHERE i.token_hash=$1
      AND i.consumed_at IS NULL AND i.expires_at>clock_timestamp()
      AND q.status='waiting'
      AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    FOR UPDATE OF i,q`,[digest(token)]);
   const item=found.rows[0];
   if(!item || item.consumed_at || item.status!=='waiting')
     throw invalid(410,'invite_expired','Havola ishlatilgan yoki muddati tugagan. QR sahifasidan yangisini oling.');
   await client.query('INSERT INTO walkin_queue_telegram_subscriptions(entry_id,chat_id) VALUES($1,$2) ON CONFLICT(entry_id) DO UPDATE SET chat_id=EXCLUDED.chat_id,consented_at=clock_timestamp()',[item.entry_id,id]);
   await client.query('UPDATE walkin_queue_telegram_invites SET consumed_at=clock_timestamp() WHERE entry_id=$1',[item.entry_id]);
   return {linked:true};
  });
 }
 async function unlink(qrToken,requestId){
  if(!isQr(qrToken)||!isKey(requestId))throw invalid(400,'invalid_ticket','QR so‘rovi noto‘g‘ri.');
  return transaction(pool,async client=>{
   const found=await client.query(`SELECT q.id FROM walkin_qr_requests r
    JOIN walkin_qr_tokens t ON t.id=r.qr_token_id JOIN walkin_queue q ON q.id=r.queue_entry_id
    WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved' FOR UPDATE OF q`,[qrDigest(qrToken),requestDigest(requestId)]);
   if(!found.rowCount)throw invalid(404,'ticket_missing','Navbat topilmadi.');
   const entry=found.rows[0].id;
   await client.query('DELETE FROM walkin_queue_telegram_subscriptions WHERE entry_id=$1',[entry]);
   await client.query("UPDATE walkin_queue_notification_outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL WHERE entry_id=$1 AND status IN ('pending','processing')",[entry]);
   await client.query("UPDATE smart_booking_telegram_outbox SET status='cancelled' WHERE offer_id IN (SELECT id FROM smart_booking_offers WHERE entry_id=$1) AND status='pending'",[entry]);
   await client.query('DELETE FROM walkin_queue_telegram_invites WHERE entry_id=$1',[entry]);
   return {unlinked:true};
  });
 }
 async function offerConsent(qrToken,requestId,enabled){
  if(!isQr(qrToken)||!isKey(requestId)||typeof enabled!=='boolean')
   throw invalid(400,'invalid_consent','QR yoki xabarnoma roziligi noto‘g‘ri.');
  return transaction(pool,async c=>{
   const owner=await c.query(`SELECT q.id,q.barber_id,q.status,q.queue_date
    FROM walkin_qr_requests r JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    JOIN walkin_queue q ON q.id=r.queue_entry_id
    WHERE t.token_hash=$1 AND r.request_hash=$2 AND r.status='approved'`,
    [qrDigest(qrToken),requestDigest(requestId)]);
   if(!owner.rowCount)throw invalid(404,'ticket_missing','QR navbat topilmadi.');
   const item=owner.rows[0];
   await c.query('SELECT pg_advisory_xact_lock($1)',[item.barber_id]);
   const latest=await c.query(`SELECT status,queue_date FROM walkin_queue WHERE id=$1
     AND queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date FOR UPDATE`,[item.id]);
   if(!latest.rowCount||latest.rows[0].status!=='waiting')
    throw invalid(409,'ticket_not_waiting','Taklif xabari faqat bugungi kutayotgan navbat uchun.');
   // The first QR proof was read before waiting on the barber/queue locks.
   // A revoked QR approval cannot subsequently switch offer delivery back on.
   const proof=await c.query(`SELECT 1 FROM walkin_qr_requests r
    JOIN walkin_qr_tokens t ON t.id=r.qr_token_id
    WHERE r.queue_entry_id=$3 AND t.token_hash=$1 AND r.request_hash=$2
      AND r.status='approved' FOR SHARE OF r`,
    [qrDigest(qrToken),requestDigest(requestId),item.id]);
   if(!proof.rowCount)throw invalid(403,'ticket_revoked','QR tasdig‘i bekor qilingan.');
   const changed=await c.query(`UPDATE walkin_queue_telegram_subscriptions
    SET offers_consent_at=CASE WHEN $2::boolean
       THEN COALESCE(offers_consent_at,clock_timestamp()) ELSE NULL END
    WHERE entry_id=$1 RETURNING entry_id`,[item.id,enabled]);
   if(!changed.rowCount)throw invalid(409,'telegram_not_linked','Avval Telegram chatni QR sahifasidan ulang.');
   if(!enabled)await c.query(`UPDATE smart_booking_telegram_outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL
    WHERE offer_id IN (SELECT id FROM smart_booking_offers WHERE entry_id=$1)
      AND status='pending'`,[item.id]);
   return {offers_enabled:enabled};
  });
 }
 async function stopChat(chat){
  const id=telegramId(chat);if(!id)throw invalid(400,'invalid_chat','Telegram chat noto‘g‘ri.');
  return transaction(pool,async client=>{
   // Serialize /stopqueue with token consumption (which locks q before linking).
   // A concurrent in-flight Telegram send still cannot be recalled, but a
   // subsequent callback cannot re-use the revoked subscription.
   await client.query(`SELECT q.id FROM walkin_queue q
    JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id
    WHERE s.chat_id=$1 ORDER BY q.id FOR UPDATE OF q`,[id]);
   const rows=await client.query('DELETE FROM walkin_queue_telegram_subscriptions WHERE chat_id=$1 RETURNING entry_id',[id]);
   if(rows.rowCount){const entries=rows.rows.map(r=>r.entry_id);
    await client.query("UPDATE walkin_queue_notification_outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL WHERE entry_id=ANY($1::bigint[]) AND status IN ('pending','processing')",[entries]);
    await client.query('DELETE FROM walkin_queue_telegram_invites WHERE entry_id=ANY($1::bigint[])',[entries]);
    await client.query("UPDATE smart_booking_telegram_outbox SET status='cancelled' WHERE offer_id IN (SELECT id FROM smart_booking_offers WHERE entry_id=ANY($1::bigint[])) AND status='pending'",[entries]);
   }
   return {unlinked:true};
  });
 }
 return {issue,consume,unlink,stopChat,offerConsent};
}
function nextBackoff(attempt,retryAfter=0){
 return telegramRetryDelay(attempt,retryAfter);
}
// Dispatcher: claim under row lock, release before Telegram I/O, fence ACK with lease_owner.
function createQueueTelegramDispatcher({pool,api,env=process.env}){
 const send=api||createTelegramApi(env.TELEGRAM_BOT_TOKEN);
 async function claim(){
  // Crash/lease expiry after network I/O has UNKNOWN delivery outcome.
  // Never replay it automatically: Telegram has no exactly-once sendMessage API.
  await pool.query(`UPDATE walkin_queue_notification_outbox
    SET status='uncertain',lease_owner=NULL,lease_until=NULL
    WHERE status='processing' AND (lease_until IS NULL OR lease_until<clock_timestamp())`);
  // Repair exhausted rows left by a previous worker; they must not loop forever.
  await pool.query(`UPDATE walkin_queue_notification_outbox
    SET status='failed',lease_owner=NULL,lease_until=NULL
    WHERE status='pending' AND attempts>=6`);
  // Ticket served/left, day ended, or consent withdrawn before a pending send.
  await pool.query(`UPDATE walkin_queue_notification_outbox o
    SET status='cancelled',lease_owner=NULL,lease_until=NULL
    WHERE o.status='pending' AND NOT EXISTS (
      SELECT 1 FROM walkin_queue q
      JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=o.chat_id
      WHERE q.id=o.entry_id AND q.status='called'
        AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    )`);
  const owner=crypto.randomUUID();
  const result=await pool.query(`WITH candidate AS (
     SELECT o.id FROM walkin_queue_notification_outbox o
     JOIN walkin_queue q ON q.id=o.entry_id
     JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=o.chat_id
     WHERE o.status='pending' AND o.event='called' AND o.attempts<6
       AND o.next_attempt_at<=clock_timestamp()
       AND q.status='called'
       AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
     ORDER BY o.next_attempt_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1
    ) UPDATE walkin_queue_notification_outbox o
    SET status='processing',attempts=o.attempts+1,lease_owner=$1::uuid,
      lease_until=clock_timestamp()+interval '45 seconds'
    FROM candidate c WHERE o.id=c.id RETURNING o.id,o.entry_id,o.chat_id,o.attempts`,[owner]);
  return result.rows[0]?{...result.rows[0],owner}:null;
 }
 async function step(){
  const job=await claim();if(!job)return false;
  // Recheck the *claimed* row and opt-in immediately before network I/O.
  // An in-flight message cannot be recalled, but late ACKs are fenced.
  const currently=await pool.query(`SELECT 1 FROM walkin_queue_notification_outbox o
     JOIN walkin_queue q ON q.id=o.entry_id
     JOIN walkin_queue_telegram_subscriptions s ON s.entry_id=q.id AND s.chat_id=o.chat_id
     WHERE o.id=$1 AND o.entry_id=$2 AND o.chat_id=$3
       AND o.lease_owner=$4::uuid AND o.status='processing'
       AND q.status='called' AND o.event='called'
       AND q.queue_date=(clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date`,
     [job.id,job.entry_id,job.chat_id,job.owner]);
  if(!currently.rowCount){
   await pool.query(`UPDATE walkin_queue_notification_outbox SET status='cancelled',lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2::uuid AND status='processing'`,[job.id,job.owner]);return true;
  }
  try{
   const sent=validateSentMessage(await send('sendMessage',{
     chat_id:String(job.chat_id),
     text:'USTARA: navbatingiz keldi. Sartaroshga murojaat qiling. Xabarlarni to‘xtatish: /stopqueue',
     protect_content:true
   },AbortSignal.timeout(20000)),job.chat_id);
   await pool.query(`UPDATE walkin_queue_notification_outbox SET status='sent',sent_at=clock_timestamp(),telegram_message_id=$3,
      lease_owner=NULL,lease_until=NULL WHERE id=$1 AND lease_owner=$2::uuid AND status='processing'`,
      [job.id,job.owner,sent.message_id]);
  }catch(e){
   const knownRateLimit=e instanceof TelegramApiError && e.code===429;
   const permanent=e instanceof TelegramApiError && [400,401,403].includes(e.code);
   // 429 is a KNOWN rejection; retry within a fixed budget. Any ambiguous
   // transport/5xx/malformed response is UNCERTAIN, never automatic replay.
   const delay=knownRateLimit?nextBackoff(Number(job.attempts),e.retryAfter):null;
   const status=permanent?'failed':knownRateLimit?(Number(job.attempts)>=6||delay===null?'failed':'pending'):'uncertain';
   await pool.query(`UPDATE walkin_queue_notification_outbox SET status=$3,
     next_attempt_at=clock_timestamp()+($4::int*interval '1 second'),lease_owner=NULL,lease_until=NULL
     WHERE id=$1 AND lease_owner=$2::uuid AND status='processing'`,
    [job.id,job.owner,status,status==='pending'?delay:0]);
  }
  return true;
 }
 return {step,claim};
}
module.exports={createQueueTelegramService,createQueueTelegramDispatcher,nextBackoff,isInvite,digest};
