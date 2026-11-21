const crypto = require('node:crypto');
const { fail, bodyObject, sessionHash, createOtpCrypto, OTP_PATTERN } = require('../utils/registration');
const { verifyPassword } = require('../utils/passwordPolicy');
const { createOtpRateLimit } = require('./otpRateLimit');
const { telegramOtpConfig, privateSender } = require('./telegramOtp');
const { telegramId } = require('../telegram/identity');
const { createTelegramApi, validateSentMessage } = require('../telegram/api');
const result = (status, code, message, extra = {}) => ({ status, body: { code, message, ...extra } });
const invalid = () => fail(401, 'Tasdiqlash sessiyasi tugagan. Parolni qayta kiriting.', 'phone_change_expired');
const conflict = () => fail(409, 'Bu raqam yoki Telegram hisobi uchun amalni bajarib bo‘lmadi.', 'phone_change_conflict');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const phoneValue = value => {
  if (typeof value !== 'string' || !/^\+998\d{9}$/.test(value)) throw fail(400, 'Yangi raqamni +998 formatida kiriting.', 'invalid_phone');
  return value;
};
const authenticContact = message => privateSender(message) && !message.forward_origin && !message.forward_date
  && telegramId(message.contact?.user_id) && telegramId(message.contact.user_id) === telegramId(message.from.id);

function createPhoneChangeService({ pool, env = process.env, api, passwords = { verifyPassword }, otpCrypto = createOtpCrypto(env) }) {
  const transport = (...args) => (api || createTelegramApi(env.TELEGRAM_BOT_TOKEN))(...args);
  const config = () => telegramOtpConfig(env);
  const now = async client => new Date((await client.query("SELECT date_trunc('milliseconds',clock_timestamp()) AS now")).rows[0].now);
  async function transaction(work) {
    const client = await pool.connect(); let broken = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='12s'");
      const answer = await work(client);
      await client.query('COMMIT');
      return answer;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }
  async function budget(client, scope, identity, max, seconds) {
    return createOtpRateLimit({ pool: client, env })(scope, `phone-change:${identity}`, max, seconds);
  }
  const limited = (seconds = 900) => result(429, 'phone_change_limited', 'Urinishlar limiti tugadi. Biroz kuting.', { retryAfter: seconds });
  async function account(client, actor) {
    if (!Number.isInteger(actor?.id) || !['customer', 'barber'].includes(actor.role)) throw invalid();
    // Every flow operation locks canonical account first, then its request.
    const user = (await client.query(`SELECT u.*,COALESCE(v.version,0) AS session_version
      FROM users u LEFT JOIN account_session_versions v ON v.user_id=u.id
      WHERE u.id=$1 AND u.role=$2 FOR UPDATE OF u`, [actor.id, actor.role])).rows[0];
    if (!user || user.session_version !== (actor.sessionVersion ?? 0)) throw invalid();
    return user;
  }
  async function request(client, user, token) {
    let hash; try { hash = sessionHash(token); } catch { throw invalid(); }
    const row = (await client.query('SELECT * FROM phone_change_requests WHERE user_id=$1 FOR UPDATE', [user.id])).rows[0];
    const time = await now(client);
    if (!row || row.session_token_hash !== hash || row.completed_at || +row.expires_at <= +time
      || row.session_version !== user.session_version || row.old_phone !== user.phone) throw invalid();
    return { row, time };
  }
  const domain = row => `phone-change:${row.user_id}:${row.id}`;
  async function phoneLock(client, phone) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ustara-phone-change-phone'),hashtext($1))", [phone]);
  }
  async function chatLock(client, chatId) {
    // Same chat lock as signup's verified-contact binding.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [String(config().botId), String(chatId)]);
  }
  async function available(client, row) {
    if ((await client.query('SELECT id FROM users WHERE phone=$1 AND id<>$2', [row.new_phone, row.user_id])).rowCount
      || (await client.query(`SELECT user_id FROM phone_change_requests WHERE new_phone=$1 AND user_id<>$2
        AND completed_at IS NULL AND expires_at>clock_timestamp()`, [row.new_phone, row.user_id])).rowCount) throw conflict();
  }
  function state(row, time) {
    return result(200, 'phone_change_pending', 'Tasdiqlashni davom ettiring.', {
      expiresAt: row.expires_at, serverNow: time, deliveryPending: !row.otp_sent_at,
      otpExpiresAt: row.otp_expires_at, resendAvailableAt: row.resend_available_at,
      attemptsRemaining: 5 - row.otp_failed_attempts, sendsRemaining: 3 - row.send_count,
      newPhone: row.new_phone,
    });
  }
  async function start(input, actor, ip) {
    const { password } = bodyObject(input);
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw fail(400, 'Profil parolini kiriting.', 'invalid_password');
    otpCrypto.ready(); config();
    return transaction(async client => {
      const user = await account(client, actor);
      // Persistent account and direct-peer budgets survive replacing a session.
      if (!await budget(client, 'ip:start', `password:account:${user.id}`, 5, 900)
        || !await budget(client, 'ip:start', `password:ip:${ip}`, 20, 900)) return limited();
      if (!await passwords.verifyPassword(password, user.password)) return result(400, 'invalid_password', 'Parol noto‘g‘ri.');
      const time = await now(client), token = otpCrypto.token(), id = otpCrypto.token();
      const botToken = crypto.randomBytes(24).toString('hex');
      await client.query('DELETE FROM phone_change_requests WHERE user_id=$1', [user.id]);
      await client.query(`INSERT INTO phone_change_requests
        (user_id,id,session_token_hash,session_version,old_phone,bot_id,bot_token_hash,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8::timestamptz+INTERVAL '10 minutes')`,
      [user.id, id, sessionHash(token), user.session_version, user.phone, config().botId, digest(botToken), time]);
      return result(201, 'phone_change_started', 'Yangi raqamni kiriting.', {
        sessionToken: token, expiresAt: new Date(+time + 600000), serverNow: time,
        botUrl: `${config().botUrl}?start=pc_${botToken}`,
      });
    });
  }
  async function choose(input, actor) {
    const body = bodyObject(input), phone = phoneValue(body.phone);
    return transaction(async client => {
      const user = await account(client, actor), { row, time } = await request(client, user, body.sessionToken);
      if (phone === user.phone) throw fail(400, 'Yangi raqam joriy raqamdan farq qilishi kerak.', 'same_phone');
      if (row.new_phone && row.new_phone !== phone) throw fail(409, 'Raqamni o‘zgartirish uchun jarayonni qayta boshlang.', 'phone_change_restart');
      await phoneLock(client, phone);
      row.new_phone = phone;
      await available(client, row);
      await client.query('UPDATE phone_change_requests SET new_phone=$2 WHERE user_id=$1', [user.id, phone]);
      return state(row, time);
    });
  }
  async function status(input, actor) {
    return transaction(async client => {
      const user = await account(client, actor), { row, time } = await request(client, user, bodyObject(input).sessionToken);
      return state(row, time);
    });
  }
  async function telegramRequest(client, found) {
    const user = (await client.query(`SELECT u.*,COALESCE(v.version,0) AS session_version FROM users u
      LEFT JOIN account_session_versions v ON v.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`, [found.user_id])).rows[0];
    const row = (await client.query('SELECT * FROM phone_change_requests WHERE user_id=$1 FOR UPDATE', [found.user_id])).rows[0];
    const time = await now(client);
    if (!user || !row || row.id !== found.id || row.completed_at || +row.expires_at <= +time || !row.new_phone
      || row.old_phone !== user.phone || row.session_version !== user.session_version) throw invalid();
    return { row, time };
  }
  async function chatAvailable(client, row, chatId) {
    if ((await client.query(`SELECT user_id FROM telegram_otp_contacts WHERE bot_id=$1
      AND (chat_id=$2 OR phone=$3 OR user_id=$4) AND user_id IS DISTINCT FROM $4
      AND (user_id IS NOT NULL OR chat_id<>$2 OR phone<>$3)`, [row.bot_id, chatId, row.new_phone, row.user_id])).rowCount) throw conflict();
    if ((await client.query(`SELECT user_id FROM phone_change_requests WHERE bot_id=$1 AND chat_id=$2
      AND user_id<>$3 AND completed_at IS NULL AND expires_at>clock_timestamp()`, [row.bot_id, chatId, row.user_id])).rowCount) throw conflict();
  }
  async function open(message, payload) {
    if (!privateSender(message) || !/^pc_[a-f0-9]{48}$/.test(payload)) throw invalid();
    const found = (await pool.query('SELECT user_id,id FROM phone_change_requests WHERE bot_id=$1 AND bot_token_hash=$2', [config().botId, digest(payload.slice(3))])).rows[0];
    if (!found) throw invalid();
    return transaction(async client => {
      const { row } = await telegramRequest(client, found);
      await chatLock(client, message.chat.id);
      await chatAvailable(client, row, String(message.chat.id));
      if (row.chat_id && String(row.chat_id) !== String(message.chat.id)) throw conflict();
      await client.query('UPDATE phone_change_requests SET chat_id=$2,context_active=TRUE WHERE user_id=$1', [row.user_id, String(message.chat.id)]);
      return true;
    });
  }
  async function clearChat(message) {
    if (!privateSender(message)) return;
    // Generic /start routes subsequent contacts to signup; keep the OTP chat binding.
    await pool.query(`UPDATE phone_change_requests SET context_active=FALSE WHERE bot_id=$1 AND chat_id=$2`, [config().botId, String(message.chat.id)]);
  }
  async function send(client, row, time) {
    if (row.otp_failed_attempts >= 5 || row.send_count >= 3) return limited();
    if (row.resend_available_at && +row.resend_available_at > +time) return result(429, 'resend_too_soon', 'Yangi kod uchun kuting.', { retryAfter: Math.ceil((+row.resend_available_at - +time) / 1000) });
    if (!await budget(client, 'ip:resend', `send:account:${row.user_id}`, 3, 900)
      || !await budget(client, 'ip:resend', `send:phone:${row.new_phone}`, 3, 900)) return limited();
    const issue = otpCrypto.issue(row.new_phone, domain(row));
    await client.query(`UPDATE phone_change_requests SET otp_hmac_hash=$2,otp_hmac_key_id=$3,
      otp_issuance_nonce=$4,otp_sent_at=$5,otp_expires_at=$5::timestamptz+INTERVAL '1 minute',
      resend_available_at=$5::timestamptz+INTERVAL '1 minute',send_count=send_count+1 WHERE user_id=$1`,
    [row.user_id, issue.hash, issue.keyId, issue.nonce, time]);
    try {
      const delivered = await transport('sendMessage', { chat_id: String(row.chat_id), protect_content: true,
        text: `USTARA raqamni almashtirish kodi: ${issue.code}\nKod 1 daqiqa amal qiladi. Kodni hech kimga bermang.` }, AbortSignal.timeout(8000));
      validateSentMessage(delivered, row.chat_id);
    } catch { throw fail(503, 'Kod yuborilmadi. Botni ochib qayta urinib ko‘ring.', 'telegram_otp_unavailable'); }
    return result(200, 'otp_sent', 'Kod yuborildi. Saytga qaytib kiriting.');
  }
  async function contact(message) {
    if (!privateSender(message)) return null;
    const found = (await pool.query(`SELECT user_id,id FROM phone_change_requests WHERE bot_id=$1 AND chat_id=$2
      AND context_active AND completed_at IS NULL AND expires_at>clock_timestamp()`, [config().botId, String(message.chat.id)])).rows[0];
    if (!found) return null;
    if (!authenticContact(message)) throw fail(400, 'Bot tugmasi orqali faqat o‘z kontaktingizni ulashing.', 'telegram_invalid_contact');
    const raw = String(message.contact.phone_number || '').replace(/^\+/, '');
    const phone = phoneValue('+' + raw);
    return transaction(async client => {
      const { row, time } = await telegramRequest(client, found);
      await chatLock(client, message.chat.id);
      if (String(row.chat_id) !== String(message.chat.id)) throw invalid();
      if (row.new_phone !== phone) throw fail(400, 'Kontakt saytdagi yangi raqamga mos emas.', 'telegram_phone_mismatch');
      await chatAvailable(client, row, String(message.chat.id));
      // Retries of the same Telegram update never issue another code.
      if (row.otp_sent_at) return result(200, 'already_sent', 'Kod avval yuborilgan. Yangi kodni saytdan so‘rang.');
      return send(client, row, time);
    });
  }
  async function resend(input, actor) {
    return transaction(async client => {
      const user = await account(client, actor), { row, time } = await request(client, user, bodyObject(input).sessionToken);
      if (!row.otp_sent_at || !row.chat_id) throw fail(409, 'Avval botda yangi raqamingizni ulashing.', 'telegram_contact_required');
      await chatLock(client, row.chat_id);
      await chatAvailable(client, row, String(row.chat_id));
      return send(client, row, time);
    });
  }
  async function verify(input, actor) {
    const body = bodyObject(input);
    const answer = await transaction(async client => {
      const user = await account(client, actor), { row, time } = await request(client, user, body.sessionToken);
      if (!row.otp_sent_at || !row.chat_id || !row.otp_hmac_hash) throw fail(409, 'Avval Telegram kontaktini tasdiqlang.', 'telegram_contact_required');
      if (row.otp_failed_attempts >= 5) return limited();
      if (!await budget(client, 'ip:verify', `verify:account:${user.id}`, 10, 900)) return limited();
      if (+row.otp_expires_at <= +time) return result(400, 'otp_expired', 'Kod muddati tugadi. Yangi kod so‘rang.');
      if (typeof body.otp !== 'string' || !OTP_PATTERN.test(body.otp)
        || !otpCrypto.matches({ ...row, phone: row.new_phone, id: domain(row) }, body.otp)) {
        await client.query('UPDATE phone_change_requests SET otp_failed_attempts=otp_failed_attempts+1 WHERE user_id=$1', [user.id]);
        return result(400, 'invalid_otp', 'Kod noto‘g‘ri.', { attemptsRemaining: 4 - row.otp_failed_attempts });
      }
      await phoneLock(client, row.new_phone);
      await chatLock(client, row.chat_id);
      await available(client, row);
      await chatAvailable(client, row, String(row.chat_id));
      // Deadlines are checked again after all potentially contended locks.
      const finishedAt = await now(client);
      if (+row.expires_at <= +finishedAt || +row.otp_expires_at <= +finishedAt) return result(400, 'otp_expired', 'Kod muddati tugadi.');
      const old = (await client.query('SELECT chat_id,bot_id FROM telegram_otp_contacts WHERE user_id=$1 AND bot_id=$2 FOR UPDATE', [user.id, row.bot_id])).rows[0];
      await client.query('UPDATE users SET phone=$2 WHERE id=$1', [user.id, row.new_phone]);
      await client.query('DELETE FROM telegram_otp_contacts WHERE user_id=$1', [user.id]);
      await client.query(`INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,user_id,verified_at)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(bot_id,phone) DO UPDATE SET
        chat_id=EXCLUDED.chat_id,user_id=EXCLUDED.user_id,verified_at=EXCLUDED.verified_at
        WHERE telegram_otp_contacts.user_id IS NULL AND telegram_otp_contacts.chat_id=EXCLUDED.chat_id
        RETURNING phone`, [row.bot_id, row.new_phone, row.chat_id, user.id, finishedAt]).then(r => { if (!r.rowCount) throw conflict(); });
      await client.query(`INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
        ON CONFLICT(user_id) DO UPDATE SET version=account_session_versions.version+1`, [user.id]);
      await client.query(`UPDATE phone_change_requests SET completed_at=$2,otp_hmac_hash=NULL,
        otp_issuance_nonce=NULL WHERE user_id=$1`, [user.id, finishedAt]);
      if (old) await client.query(`INSERT INTO phone_change_notices(request_id,user_id,bot_id,chat_id)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [row.id, user.id, old.bot_id, old.chat_id]);
      return result(200, 'phone_changed', 'Raqam yangilandi. Yangi raqam bilan tizimga kiring.');
    });
    if (answer.body.code === 'phone_changed') {
      // Notification failure never undoes a committed change; durable outbox retries.
      try { await flushNotices(); } catch { /* Fixed safe boundary; no raw logs. */ }
    }
    return answer;
  }
  async function flushNotices() {
    return transaction(async client => {
      const rows = (await client.query(`SELECT * FROM phone_change_notices WHERE bot_id=$1
        AND sent_at IS NULL AND retry_at<=clock_timestamp() ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED`, [config().botId])).rows;
      for (const row of rows) {
        try {
          const sent = await transport('sendMessage', { chat_id: String(row.chat_id), protect_content: true,
            text: 'USTARA: hisobingizning telefon raqami parol va yangi raqamning Telegram tasdiqlashi orqali almashtirildi. Agar buni siz qilmagan bo‘lsangiz, yordam xizmatiga murojaat qiling.' }, AbortSignal.timeout(8000));
          validateSentMessage(sent, row.chat_id);
          await client.query('UPDATE phone_change_notices SET sent_at=clock_timestamp(),attempts=attempts+1 WHERE request_id=$1', [row.request_id]);
        } catch {
          await client.query("UPDATE phone_change_notices SET attempts=attempts+1,retry_at=clock_timestamp()+INTERVAL '5 minutes' WHERE request_id=$1", [row.request_id]);
        }
      }
    });
  }
  return { start, choose, status, resend, verify, open, contact, clearChat, flushNotices };
}
module.exports = { createPhoneChangeService, authenticContact, phoneValue };
