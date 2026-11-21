'use strict';
// v190: explicit, separate customer Telegram contact binding. An OTP contact
// alone never opts a customer into booking notifications.
const crypto = require('node:crypto');
const { botConfig } = require('./telegramLinkService');
const { telegramId } = require('../telegram/identity');
class CustomerTelegramError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this,{status,code}); }
}
const fail = (status,code,message) => new CustomerTelegramError(status,code,message);
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_PATTERN = /^cust_([0-9a-f]{48})$/;
const MAX_AGE_MINUTES = 5;
function createCustomerTelegramLink({pool,env=process.env}) {
  async function transaction(fn) {
    const c=await pool.connect();let broken=false;
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='5s'");
      await c.query("SET LOCAL statement_timeout='10s'");
      const value=await fn(c);
      const commit=await c.query('COMMIT');
      // In Telegram webhooks the adapter maps COMMIT to RELEASE SAVEPOINT;
      // the outer webhook commits before sending its informational reply.
      if (commit.command && !['COMMIT','RELEASE'].includes(commit.command)) throw new Error('Unconfirmed transaction');
      return value;
    } catch(error) { try {await c.query('ROLLBACK');} catch {broken=true;} throw error; }
    finally {c.release(broken);}
  }
  async function actorOwner(c,actor) {
    if(actor?.role!=='customer'||!Number.isSafeInteger(actor.id)||actor.id<=0||!Number.isSafeInteger(actor.profileId)||actor.profileId<=0)
      throw fail(403,'customer_required','Faqat mijoz uchun.');
    // Lock the user first. Suspensions/deletions use this same parent row;
    // the session version is checked again in the bot consumer.
    const owner=await c.query(`SELECT u.id FROM users u JOIN customers p ON p.user_id=u.id
      WHERE u.id=$1 AND p.id=$2 AND u.role='customer' AND u.deactivated_at IS NULL
        AND u.admin_suspended_at IS NULL FOR SHARE OF u,p`,[actor.id,actor.profileId]);
    if(!owner.rowCount) throw fail(401,'unauthorized','Akkaunt faol emas.');
    const version=await c.query('SELECT version FROM account_session_versions WHERE user_id=$1',[actor.id]);
    const current=version.rows[0]?.version ?? 0;
    if(current!==(actor.sessionVersion??0)) throw fail(401,'unauthorized','Qayta kiring.');
    return {id:actor.id,version:current};
  }
  function config(){return botConfig(env);}
  async function start(actor){
    const {botUrl}=config();
    return transaction(async c=>{
      const user=await actorOwner(c,actor);
      const linked=await c.query('SELECT 1 FROM customer_telegram_links WHERE user_id=$1',[user.id]);
      if(linked.rowCount)throw fail(409,'already_linked','Telegram bog‘langan. Avval uzing.');
      // 192-bit token + prefix stays within Telegram's 64-char /start limit.
      const token=crypto.randomBytes(24).toString('hex');
      await c.query(`INSERT INTO customer_telegram_link_tokens(user_id,token_hash,created_at,expires_at,session_version)
        SELECT $1,$2,moment.now,moment.now+INTERVAL '5 minutes',$3 FROM (SELECT clock_timestamp() AS now) moment WHERE TRUE
        ON CONFLICT(user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
        created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,session_version=EXCLUDED.session_version`,
      [user.id,hash(token),user.version]);
      return {deepLink:`${botUrl}?start=cust_${token}`,expiresInSeconds:MAX_AGE_MINUTES*60,linked:false};
    });
  }
  async function status(actor){
    return transaction(async c=>{
      const user=await actorOwner(c,actor);
      const result=await c.query('SELECT linked_at,notification_opt_in_at FROM customer_telegram_links WHERE user_id=$1',[user.id]);
      return {linked:!!result.rowCount,linkedAt:result.rows[0]?.linked_at??null,
        notificationsEnabled:!!result.rows[0]?.notification_opt_in_at};
    });
  }
  async function unlink(actor){
    return transaction(async c=>{
      const user=await actorOwner(c,actor);
      await c.query('DELETE FROM customer_telegram_link_tokens WHERE user_id=$1',[user.id]);
      await c.query('DELETE FROM customer_telegram_links WHERE user_id=$1',[user.id]);
      return {linked:false,notificationsEnabled:false};
    });
  }
  async function preferences(actor,body){
    if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.notificationsEnabled!=='boolean')
      throw fail(400,'invalid_preference','Bildirishnoma tanlovi noto‘g‘ri.');
    return transaction(async c=>{
      const user=await actorOwner(c,actor);
      const updated=await c.query(`UPDATE customer_telegram_links SET notification_opt_in_at=CASE
        WHEN $2::boolean THEN COALESCE(notification_opt_in_at,clock_timestamp()) ELSE NULL END
        WHERE user_id=$1 RETURNING linked_at,notification_opt_in_at`,[user.id,body.notificationsEnabled]);
      if(!updated.rowCount)throw fail(409,'not_linked','Avval Telegram hisobingizni ulang.');
      return {linked:true,notificationsEnabled:!!updated.rows[0].notification_opt_in_at};
    });
  }
  // Called exclusively from the trusted private bot update dispatcher, never HTTP.
  async function consume(parameter,chatId){
    const match=typeof parameter==='string'&&TOKEN_PATTERN.exec(parameter);
    const id=telegramId(chatId);
    if(!match||!id||BigInt(id)>BigInt(Number.MAX_SAFE_INTEGER))throw fail(400,'invalid_link','Bog‘lash havolasi noto‘g‘ri yoki eskirgan.');
    return transaction(async c=>{
      const tokenHash=hash(match[1]);
      const found=await c.query('SELECT user_id FROM customer_telegram_link_tokens WHERE token_hash=$1',[tokenHash]);
      if(!found.rowCount)throw fail(410,'expired_link','Havola eskirgan. Saytdan yangisini oling.');
      const userId=found.rows[0].user_id;
      const user=await c.query(`SELECT u.id FROM users u JOIN customers p ON p.user_id=u.id
        WHERE u.id=$1 AND u.role='customer' AND u.deactivated_at IS NULL
          AND u.admin_suspended_at IS NULL FOR SHARE OF u,p`,[userId]);
      if(!user.rowCount)throw fail(410,'expired_link','Havola eskirgan.');
      const pending=await c.query(`SELECT session_version FROM customer_telegram_link_tokens
        WHERE user_id=$1 AND token_hash=$2 AND expires_at>clock_timestamp() FOR UPDATE`,[userId,tokenHash]);
      const session=await c.query('SELECT version FROM account_session_versions WHERE user_id=$1',[userId]);
      if(!pending.rowCount || pending.rows[0].session_version!==(session.rows[0]?.version??0))
        throw fail(410,'expired_link','Havola eskirgan.');
      // A Telegram private chat cannot be registered for multiple customer accounts,
      // another linked barber, or another account's OTP contact.
      const elsewhere=await c.query(`SELECT
        EXISTS(SELECT 1 FROM barber_telegram_links WHERE chat_id=$1) OR
        EXISTS(SELECT 1 FROM customer_telegram_links WHERE chat_id=$1 AND user_id<>$2) OR
        EXISTS(SELECT 1 FROM telegram_otp_contacts WHERE chat_id=$1 AND user_id IS NOT NULL AND user_id<>$2) AS taken`,[id,userId]);
      if(elsewhere.rows[0]?.taken)throw fail(409,'chat_already_used','Bu Telegram boshqa akkauntga bog‘langan.');
      try {
        const linked=await c.query(`INSERT INTO customer_telegram_links(user_id,chat_id,linked_at,notification_opt_in_at)
          VALUES($1,$2,clock_timestamp(),NULL) ON CONFLICT(user_id) DO NOTHING RETURNING user_id`,[userId,id]);
        if(!linked.rowCount)throw fail(409,'already_linked','Telegram avval bog‘langan.');
      }catch(error){if(error.code==='23505')throw fail(409,'chat_already_used','Telegram boshqa akkauntga bog‘langan.');throw error;}
      await c.query('DELETE FROM customer_telegram_link_tokens WHERE user_id=$1',[userId]);
      return {linked:true,notificationsEnabled:false};
    });
  }
  return {start,status,unlink,preferences,consume};
}
module.exports={createCustomerTelegramLink,CustomerTelegramError,TOKEN_PATTERN};
