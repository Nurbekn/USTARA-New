const crypto = require('node:crypto');
const { fail, normalizePhone } = require('../utils/registration');
const { telegramOtpConfig, privateSender } = require('./telegramOtp');
const { telegramId } = require('../telegram/identity');
const invalid = () => fail(410, 'Kod so‘rovi eskirgan. Saytda yangi kod so‘rang.', 'telegram_request_expired');
function createTelegramRegistration({ pool, env = process.env, contacts, deliver }) {
  function config() { return telegramOtpConfig(env); }
  return {
    async prepare(client, pending) {
      const { botId, botUrl } = config();
      // Internal generation identifier rejects contact/resend races; never exposed in a URL.
      const generation = crypto.randomBytes(32).toString('hex');
      await client.query(`INSERT INTO telegram_registration_requests
        (registration_id,bot_id,token_hash,expires_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(registration_id) DO UPDATE SET bot_id=EXCLUDED.bot_id,
          token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,chat_id=NULL,delivered_at=NULL`,
      [pending.id, botId, generation, pending.session_expires_at]);
      return { deliveryPending: true, botUrl, otpExpiresAt: null, resendAfter: 0 };
    },
    async state(client, id) {
      const result = await client.query('SELECT delivered_at FROM telegram_registration_requests WHERE registration_id=$1 AND bot_id=$2', [id, config().botId]);
      return result.rows[0];
    },
    async lock(client, id, tokenHash, chatId) {
      const result = await client.query(`SELECT delivered_at FROM telegram_registration_requests
        WHERE registration_id=$1 AND bot_id=$2 AND token_hash=$3 AND (chat_id IS NULL OR chat_id=$4)
          AND expires_at>clock_timestamp() FOR UPDATE`, [id, config().botId, tokenHash, String(chatId)]);
      if (!result.rows[0]) throw invalid();
      await client.query('UPDATE telegram_registration_requests SET chat_id=$2 WHERE registration_id=$1', [id, String(chatId)]);
      return result.rows[0];
    },
    async sent(client, id, time) {
      await client.query('UPDATE telegram_registration_requests SET delivered_at=$2 WHERE registration_id=$1', [id, time]);
    },
    async bindAccount(client, pending, userId) {
      const result = await client.query(`UPDATE telegram_otp_contacts c SET user_id=$3
        FROM telegram_registration_requests r WHERE r.registration_id=$1 AND r.bot_id=$2
          AND r.delivered_at IS NOT NULL AND c.bot_id=r.bot_id AND c.chat_id=r.chat_id
          AND c.phone=$4 AND c.user_id IS NULL RETURNING c.phone`,
      [pending.id, config().botId, userId, pending.phone]);
      if (!result.rows.length) throw fail(409, 'Telegram bog‘lanishini tasdiqlab bo‘lmadi. Qayta boshlang.', 'telegram_link_conflict');
    },
    async contact(message) {
      if (!privateSender(message) || message.forward_origin || message.forward_date
        || !telegramId(message.contact?.user_id) || telegramId(message.contact.user_id) !== telegramId(message.from.id)) {
        throw fail(400, 'Faqat o‘zingizning kontaktingizni botdagi tugma orqali ulashing.', 'telegram_invalid_contact');
      }
      let phone;
      try { phone = normalizePhone(message.contact.phone_number); }
      catch { throw fail(400, 'Telefon kontakti noto‘g‘ri.', 'telegram_invalid_contact'); }
      const result = await pool.query(`SELECT r.registration_id,r.token_hash,p.phone FROM telegram_registration_requests r
        JOIN pending_registrations p ON p.id=r.registration_id
        WHERE r.bot_id=$1 AND p.phone=$2 AND r.expires_at>clock_timestamp()
          AND p.session_expires_at>clock_timestamp() AND p.phone_verified_at IS NULL`, [config().botId, phone]);
      const row = result.rows[0];
      if (!row) return null;
      if (row.phone !== phone) throw fail(409, 'Telegram kontaktingiz saytda kiritilgan raqamga mos emas. Saytda raqamni to‘g‘rilang yoki o‘sha raqamdagi Telegram hisobidan botni oching.', 'telegram_phone_mismatch');
      if (!await contacts.bind(message)) throw fail(400, 'O‘z telefon kontaktingizni ulashing.', 'telegram_invalid_contact');
      return deliver({ registrationId: row.registration_id, tokenHash: row.token_hash, phone, chatId: message.chat.id });
    },
  };
}
module.exports = { createTelegramRegistration };
