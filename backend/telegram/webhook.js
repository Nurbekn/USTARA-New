const crypto = require('node:crypto');
const { createPhoneChangeService } = require('../services/phoneChangeService');
const { createTelegramApi } = require('./api');
const { createTelegramContacts, createTelegramOtpAdapter, telegramOtpConfig } = require('../services/telegramOtp');
const { createRegistrationService } = require('../services/registrationService');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const { createTelegramLinkService } = require('../services/telegramLinkService');
const {createCustomerTelegramLink}=require('../services/customerTelegramLinkV190');
const { createBookingStatusService } = require('../services/bookingStatusService');
const { createOtpRateLimit } = require('../services/otpRateLimit');
const { createUpdateHandler } = require('./handler');
const { createQueueTelegramService } = require('../services/queueTelegramNotifications');
const {createSmartBookingOffers}=require('../services/smartBookingOffers');
const { createTransactionPool } = require('./transactionPool');
const { createWebhookLifecycle, webhookPoolOptions } = require('./webhookLifecycle');

function authorized(actual, expected) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(expected || '') || typeof actual !== 'string') return false;
  const a = crypto.createHash('sha256').update(actual).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
function botHandler({ pool, env, api, otpApi }) {
  const { botId } = telegramOtpConfig(env);
  const contacts = createTelegramContacts({ pool, botId });
  const service = createRegistrationService({ pool, env, sms: createTelegramOtpAdapter({ pool, env, api: otpApi }) });
  return createUpdateHandler({ api, username: env.TELEGRAM_BOT_USERNAME, botId, contacts,
    phoneChange: createPhoneChangeService({ pool, env, api: otpApi }),
    registration: createTelegramRegistration({ pool, env, contacts, deliver: service.deliverTelegram }),
    service: createTelegramLinkService({ pool, env }), customerTelegram: createCustomerTelegramLink({pool,env}), bookings: createBookingStatusService({ pool }),
    queueNotify: createQueueTelegramService({pool,env}),
    offerDecisions: createSmartBookingOffers(pool),
    rateLimit: createOtpRateLimit({ pool, env }) });
}
function createWebhookController({ pool, env = process.env, api, handlerFactory = botHandler, deadlines }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (env.TELEGRAM_UPDATE_MODE !== 'webhook') return res.sendStatus(404);
    if (!authorized(req.get('X-Telegram-Bot-Api-Secret-Token'), env.TELEGRAM_WEBHOOK_SECRET)) return res.sendStatus(403);
    const update = req.body;
    if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return res.sendStatus(400);
    let lifecycle;
    let transactionOpen = false;
    try {
      const { botId } = telegramOtpConfig(env);
      lifecycle = createWebhookLifecycle(deadlines);
      lifecycle.watchRequest(req, res);
      await lifecycle.acquire(pool);
      const query = (...args) => lifecycle.query(...args);
      // Same session lock as polling: modes cannot consume updates concurrently.
      const lock = await query("SELECT pg_try_advisory_lock(hashtext('ustara-telegram-poller'),hashtext($1)) AS acquired", [String(botId)]);
      if (!lock.rows[0].acquired) return res.sendStatus(503);
      await query('BEGIN'); transactionOpen = true;
      const done = await query('SELECT update_id FROM telegram_webhook_receipts WHERE bot_id=$1 AND update_id=$2', [botId, update.update_id]);
      const replies = [];
      const transport = api || createTelegramApi(env.TELEGRAM_BOT_TOKEN);
      const send = (method, body, signal) => {
        lifecycle.assertActive();
        const combined = signal ? AbortSignal.any([signal, lifecycle.signal]) : lifecycle.signal;
        return lifecycle.run(() => { lifecycle.assertActive(); return transport(method, body, combined); });
      };
      if (!done.rows.length) {
        const botPool = createTransactionPool({ query }, { assertActive: lifecycle.assertActive,
          onBroken: () => lifecycle.abort('webhook_transaction_broken') });
        // Informational replies never announce business success before COMMIT.
        // OTP transport stays synchronous so delivered_at requires validated delivery.
        const replyApi = async (method, body) => {
          lifecycle.assertActive();
          if (!['sendMessage', 'answerCallbackQuery', 'editMessageReplyMarkup'].includes(method)) throw new Error('Invalid reply method');
          replies.push({ method, body: structuredClone(body) });
        };
        const handler = handlerFactory({ pool: botPool, env, api: replyApi, otpApi: send });
        await lifecycle.run(() => handler(update, lifecycle.signal));
        botPool.assertComplete();
        await query('INSERT INTO telegram_webhook_receipts(bot_id,update_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [botId, update.update_id]);
      }
      const committed = await query('COMMIT');
      if (committed.command !== 'COMMIT') throw new Error('Telegram transaction did not commit');
      transactionOpen = false;
      // A reply failure must not replay already committed business operations.
      // These best-effort replies are not a durable outbox; crash loss is possible.
      for (const reply of replies) {
        try { await send(reply.method, reply.body, AbortSignal.timeout(8000)); }
        catch { /* Do not expose raw transport errors or undo committed receipts. */ }
      }
      lifecycle.assertActive();
      return res.sendStatus(200);
    } catch {
      if (transactionOpen && lifecycle && !lifecycle.signal.aborted) {
        try { await lifecycle.query('ROLLBACK', undefined, lifecycle.deadlines.rollbackMs); }
        catch { lifecycle.abort('webhook_rollback_failed'); }
      }
      // Never propagate update bodies, pg details or Telegram transport errors.
      if (res.destroyed || res.writableEnded) return res;
      return res.sendStatus(503);
    } finally {
      // Destroying the session always releases its advisory lock, even on error.
      lifecycle?.dispose();
    }
  };
}
let controller;
module.exports = { authorized, createWebhookController, webhook(req, res) {
  if (!controller) {
    // Bound pg's own pool queue and socket establishment without changing the
    // shared application pool. Credentials/configuration stay in existing wiring.
    const { Pool } = require('pg');
    const pool = new Pool(webhookPoolOptions(require('../db').options));
    pool.on('error', () => {}); // Discard raw driver details, including on destroy.
    controller = createWebhookController({ pool });
  }
  return controller(req, res);
} };
