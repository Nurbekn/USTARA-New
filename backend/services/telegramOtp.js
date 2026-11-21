const { fail, normalizePhone, OTP_PATTERN } = require('../utils/registration');
const { createTelegramApi, validateSentMessage } = require('../telegram/api');
const { telegramId } = require('../telegram/identity');
const CONTACT_TTL_MINUTES = 30;
function telegramOtpConfig(env = process.env) {
  const match = /^([1-9]\d*):[A-Za-z0-9_-]{20,}$/.exec(env.TELEGRAM_BOT_TOKEN || '');
  if (!match || !Number.isSafeInteger(Number(match[1]))
    || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(env.TELEGRAM_BOT_USERNAME || '')) {
    throw fail(503, 'Telegram orqali kod yuborish hali sozlanmagan.', 'telegram_otp_unavailable');
  }
  return { botId: Number(match[1]), botUrl: `https://t.me/${env.TELEGRAM_BOT_USERNAME}` };
}
function privateSender(message) {
  const id = telegramId(message?.chat?.id);
  return message?.chat?.type === 'private' && !!id
    && telegramId(message.from?.id) === id && message.from.is_bot !== true;
}
function createTelegramContacts({ pool, botId }) {
  if (!Number.isSafeInteger(botId) || botId <= 0) throw new Error('Invalid bot identity');
  return {
    async bind(message) {
      if (!privateSender(message) || message.forward_origin || message.forward_date
        || !telegramId(message.contact?.user_id)
        || telegramId(message.contact.user_id) !== telegramId(message.from.id)) return false;
      let phone;
      try { phone = normalizePhone(message.contact.phone_number); } catch { return false; }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout='3s'");
        await client.query("SET LOCAL statement_timeout='5s'");
        // One worker processes updates in order; locks also serialize other bind callers.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))', [String(botId), String(message.chat.id)]);
        // Never enroll legacy accounts through an unsolicited contact.
        if ((await client.query('SELECT id FROM users WHERE phone=$1', [phone])).rows.length) {
          throw fail(409, 'Mavjud hisobni tiklash uchun administratorga murojaat qiling.', 'telegram_link_conflict');
        }
        await client.query(`INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,verified_at)
          VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(bot_id,phone)
          DO UPDATE SET verified_at=EXCLUDED.verified_at
          WHERE telegram_otp_contacts.chat_id=EXCLUDED.chat_id AND telegram_otp_contacts.user_id IS NULL
          RETURNING phone`, [botId, phone, String(message.chat.id)]).then(result => {
          if (!result.rows.length) throw fail(409, 'Telegram hisobi yoki telefon boshqa hisobga bog‘langan.', 'telegram_link_conflict');
        });
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') throw fail(409, 'Telegram hisobi boshqa raqamga bog‘langan.', 'telegram_link_conflict');
        throw error;
      } finally { client.release(); }
    },
  };
}
function createTelegramOtpAdapter({ pool, env = process.env, api, logger = console }) {
  return {
    deferredRegistration: true,
    ready() { telegramOtpConfig(env); },
    exposeCode() { return false; },
    async send({ phone, code, client = pool, purpose = 'registration', userId }) {
      const { botId } = telegramOtpConfig(env);
      if (!OTP_PATTERN.test(code) || typeof code !== 'string') throw fail(503, 'Kod yuborilmadi.', 'telegram_otp_unavailable');
      const normalized = normalizePhone(phone);
      const result = purpose === 'password-reset'
        ? await client.query(`SELECT chat_id FROM telegram_otp_contacts
          WHERE bot_id=$1 AND phone=$2 AND user_id=$3`, [botId, normalized, userId])
        : await client.query(`SELECT chat_id FROM telegram_otp_contacts
          WHERE bot_id=$1 AND phone=$2 AND user_id IS NULL AND verified_at>clock_timestamp()-INTERVAL '30 minutes'`, [botId, normalized]);
      const chatId = result.rows[0]?.chat_id;
      if (!chatId) throw fail(409, 'Telegram botni oching, o‘z telefon kontaktingizni ulashing va qayta urinib ko‘ring.', 'telegram_contact_required');
      try {
        const send = api || createTelegramApi(env.TELEGRAM_BOT_TOKEN);
        const result = await send('sendMessage', { chat_id: String(chatId),
          text: `USTARA tasdiqlash kodi: ${code}\nKod 1 daqiqa amal qiladi. Kodni hech kimga bermang. Agar uni siz so‘ramagan bo‘lsangiz, e’tiborsiz qoldiring.`,
          protect_content: true }, AbortSignal.timeout(8000));
        // Injected transports must obey the same delivery contract as the API.
        validateSentMessage(result, chatId);
      } catch (error) {
        // Telegram API wrapper never exposes the token, recipient or OTP.
        logger.error('telegram_otp_delivery_failed', { reason: error.code === 403 ? 'bot_blocked' : 'provider_unavailable' });
        throw fail(503, 'Telegram orqali kod yuborilmadi. Botni qayta ochib urinib ko‘ring.', 'telegram_otp_unavailable');
      }
    },
  };
}
module.exports = { telegramOtpConfig, createTelegramContacts, createTelegramOtpAdapter, privateSender, CONTACT_TTL_MINUTES };
