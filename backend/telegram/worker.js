const { Pool } = require("pg");
const { createPhoneChangeService } = require("../services/phoneChangeService");
const { createPoolConfig } = require("../database/poolConfig");
const { setTimeout: delay } = require("node:timers/promises");
const { createTelegramApi, TelegramApiError } = require("./api");
const {pauseAfterTelegramError,pollingRetryDelaySeconds}=require("./pollingRetry");
const { createRegistrationService } = require("../services/registrationService");
const { createTelegramRegistration } = require("../services/telegramRegistration");
const { createTelegramContacts } = require("../services/telegramOtp");
const { createOtpRateLimit } = require('../services/otpRateLimit');
const { createUpdateHandler } = require("./handler");
const { createBookingStatusService } = require("../services/bookingStatusService");
const { createSmartBookingOffers } = require("../services/smartBookingOffers");
const { createQueueTelegramService } = require("../services/queueTelegramNotifications");
const { createTelegramLinkService, botConfig } = require("../services/telegramLinkService");
const { createCustomerTelegramLink } = require("../services/customerTelegramLinkV190");

async function runWorker({ pool, env = process.env, api = createTelegramApi(env.TELEGRAM_BOT_TOKEN), signal }) {
  if (env.TELEGRAM_UPDATE_MODE === 'webhook') throw new Error('Polling disabled in webhook mode');
  botConfig(env);
  const botId = env.TELEGRAM_BOT_TOKEN.split(":")[0];
  let client;
  try { client = await pool.connect(); }
  catch (error) { error.workerStage = 'database_connect'; throw error; }
  const stop = new AbortController();
  const combined = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const lost = () => stop.abort();
  client.on("error", lost); client.on("end", lost);
  let acquired = false;
  let phase = 'database_lock';
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('ustara-telegram-poller'),hashtext($1)) AS acquired", [botId]);
    if (!lock.rows[0].acquired) return false;
    acquired = true;
    phase = 'telegram_identity';
    const me = await api("getMe", {}, combined);
    if (String(me?.id) !== botId || !me.is_bot || me.username?.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.toLowerCase()) throw new Error("Bot identity mismatch");
    phase = 'telegram_webhook';
    const webhook = await api("getWebhookInfo", {}, combined);
    if (webhook.url) throw new Error("Webhook configured; polling refused");
    phase = 'database_cursor';
    await client.query("INSERT INTO telegram_bot_state(bot_id,next_update_id) VALUES($1,0) ON CONFLICT(bot_id) DO NOTHING", [botId]);
    const saved = await client.query("SELECT next_update_id FROM telegram_bot_state WHERE bot_id=$1", [botId]);
    let offset = Number(saved.rows[0].next_update_id);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid bot cursor");
    // All bot DB work uses the dedicated lock-owning connection. A dead leader
    // cannot reconnect through a pool and continue consuming capabilities.
    const botPool = { connect: async () => ({ query: client.query.bind(client), release() {} }), query: client.query.bind(client) };
    const contacts = createTelegramContacts({ pool: botPool, botId: me.id });
    const registration = createRegistrationService({ pool: botPool, env });
    const phoneChange = createPhoneChangeService({ pool: botPool, env, api });
    const requests = createTelegramRegistration({ pool: botPool, env, contacts, deliver: registration.deliverTelegram });
    const handler = createUpdateHandler({ service: createTelegramLinkService({ pool: botPool, env }), customerTelegram: createCustomerTelegramLink({pool:botPool,env}), api, username: me.username,
      contacts, registration: requests, phoneChange,
      rateLimit: createOtpRateLimit({ pool: botPool, env }),
      bookings: createBookingStatusService({ pool: botPool }), botId: me.id,
      queueNotify: createQueueTelegramService({pool: botPool,env}),
      offerDecisions: createSmartBookingOffers(botPool) });
    while (!combined.aborted) {
      phase = 'database_health';
      await client.query("SELECT 1");
      await phoneChange.flushNotices();
      phase = 'telegram_polling';
      let updates;
      try { updates = await api("getUpdates", { offset, timeout: 25, limit: 100, allowed_updates: ["message", "callback_query"] }, combined); }
      catch (error) {
        if (combined.aborted) break;
        if (!(error instanceof TelegramApiError) || [401, 409].includes(error.code)) throw error;
        await pauseAfterTelegramError(error, combined); continue;
      }
      if (!Array.isArray(updates)) throw new Error("Invalid update batch");
      for (const update of updates) {
        if (combined.aborted) break;
        if (!Number.isSafeInteger(update.update_id) || update.update_id < offset) throw new Error("Invalid update cursor");
        phase = 'update_processing';
        try { await handler(update, combined); }
        catch (error) {
          if (combined.aborted) break;
          if (error instanceof TelegramApiError) {
            if ([401, 409].includes(error.code)) throw error;
            // Permanent inability to reply (e.g. user blocked bot) must not stall
            // the entire bot. Transient errors retry the same update on restart.
            if (![400, 403].includes(error.code)) { await pauseAfterTelegramError(error, combined); break; }
          } else throw error;
        }
        phase = 'database_cursor';
        await client.query("UPDATE telegram_bot_state SET next_update_id=$2 WHERE bot_id=$1", [botId, update.update_id + 1]);
        offset = update.update_id + 1;
      }
    }
    return true;
  } catch (error) {
    if (combined.aborted) return true;
    error.workerStage = phase;
    throw error;
  } finally {
    stop.abort();
    if (acquired) {
      try { await client.query("SELECT pg_advisory_unlock(hashtext('ustara-telegram-poller'),hashtext($1))", [botId]); } catch { /* Connection loss releases the session lock. */ }
    }
    client.removeListener("error", lost); client.removeListener("end", lost);
    client.release(true); // Destroy the dedicated connection, never return its session lock to the pool.
  }
}
async function main() {
  // No dotenv loading: provide secrets through the process supervisor.
  const env = process.env;
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN);
  botConfig(env);
  let databaseConfig;
  try { databaseConfig = createPoolConfig(env); }
  catch { throw Object.assign(new Error('Invalid worker database configuration'), { code: 'worker_database_configuration' }); }
  const pool = new Pool({ ...databaseConfig, max: 1, connectionTimeoutMillis: 5000,
    query_timeout: 10000, keepAlive: true, keepAliveInitialDelayMillis: 10000 });
  pool.on("error", () => {});
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const running = await runWorker({ pool, env, api, signal: controller.signal });
    if (!running) console.info('Boshqa Telegram worker shu bot uchun allaqachon ishlayapti; ikkinchi worker ishga tushirilmadi.');
  }
  finally { await pool.end(); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}
function failureHint(error) {
  // Only fixed labels leave this boundary; never print raw error/message/cause.
  const stages = {
    database_connect: 'PostgreSQLga ulanish', database_lock: 'Worker lockini olish',
    database_cursor: 'Telegram cursorini saqlash', database_health: 'PostgreSQL aloqasi',
    telegram_identity: 'Telegram getMe', telegram_webhook: 'Telegram webhook tekshiruvi',
    telegram_polling: 'Telegram getUpdates', update_processing: 'Telegram xabarini qayta ishlash',
  };
  const reasons = {
    configuration: 'TELEGRAM_BOT_TOKEN mavjud emas yoki formati noto‘g‘ri.',
    telegram_unavailable: 'TELEGRAM_BOT_USERNAME mavjud emas yoki formati noto‘g‘ri.',
    worker_database_configuration: 'Database konfiguratsiyasi yaroqsiz. DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD va NODE_ENV/test sozlamalarini tekshiring.',
    transport: 'Telegram API bilan HTTPS aloqa o‘rnatilmadi yoki vaqt tugadi. Internet, DNS, proxy va TLS sertifikatlarini tekshiring.',
    invalid_response: 'Telegram API kutilgan formatdagi javobni qaytarmadi.',
    401: 'Telegram bot tokenini rad etdi. Tokenni bot sozlamalarida tekshiring.',
    409: 'Telegram polling to‘qnashuvi. Boshqa polling jarayoni yoki webhookni tekshiring.',
    403: 'Telegram API bu amalni taqiqladi.',
    429: 'Telegram API so‘rovlar limiti. Biroz kutib qayta ishga tushiring.',
    telegram_retry_requires_review: 'Telegram qayta urinish muddati yaroqsiz yoki 30 kundan katta; operator tekshiruvi kerak.',
    ENOTFOUND: 'PostgreSQL hosti DNS orqali topilmadi.',
    EAI_AGAIN: 'PostgreSQL hosti uchun DNS vaqtincha ishlamayapti.',
    ECONNREFUSED: 'PostgreSQL ulanishi rad etildi. Server va portni tekshiring.',
    ETIMEDOUT: 'PostgreSQL ulanish vaqti tugadi. Server va tarmoqni tekshiring.',
    '28P01': 'PostgreSQL login yoki parolni rad etdi. Database hisob ma’lumotlarini tekshiring.',
    '28000': 'PostgreSQL ulanishga ruxsat bermadi. Database roli va pg_hba.conf qoidalarini tekshiring.',
    '3D000': 'Sozlangan PostgreSQL bazasi mavjud emas.',
    '42501': 'Database rolida kerakli ruxsat yo‘q. Jadval, sequence yoki schema grantlarini tekshiring.',
    '42P01': 'Telegram uchun kerakli database jadvali mavjud emas. Qo‘llangan migrationlarni tekshiring.',
    '42703': 'Database ustuni mavjud emas. Kod va migration versiyalarini tekshiring.',
    '23505': 'Database unique cheklovi bilan konflikt. So‘rovlar va Telegram migration versiyasini tekshiring.',
    '53300': 'PostgreSQL ulanishlar limiti tugagan.',
    otp_unavailable: 'OTP_HMAC_KEY yoki OTP_HMAC_KEY_ID yaroqsiz. API va worker bir xil OTP sozlamalaridan foydalanishi kerak.',
    telegram_otp_unavailable: 'Telegram OTP konfiguratsiyasi yoki yetkazish xizmati tayyor emas.',
  };
  let hint = Object.hasOwn(reasons, error?.code) ? reasons[error.code] : null;
  if (!hint && /Bot identity mismatch/.test(error?.message || '')) hint = 'TELEGRAM_BOT_USERNAME token tegishli bo‘lgan bot bilan mos kelmadi.';
  if (!hint && /Webhook configured|Polling disabled/.test(error?.message || '')) hint = 'Polling/webhook rejimlari to‘qnashyapti. Webhook rejimida polling workerini ishga tushirmang.';
  if (!hint && /Invalid bot cursor|Invalid update cursor|Invalid update batch/.test(error?.message || '')) hint = 'Telegram update cursori yoki javob formati yaroqsiz. Bot holatini tekshiring.';
  if (!hint) hint = 'Kutilmagan worker xatosi. Ko‘rsatilgan bosqich bo‘yicha konfiguratsiya, database va Telegram aloqasini tekshiring.';
  const stage = Object.hasOwn(stages, error?.workerStage) ? stages[error.workerStage] : '';
  return stage ? `${stage}: ${hint}` : hint;
}
if (require.main === module) main().catch((error) => { console.error('Telegram worker to‘xtadi:', failureHint(error)); process.exitCode = 1; });
module.exports = { runWorker, failureHint, pollingRetryDelaySeconds, createWorkerPoolConfig: createPoolConfig };
