'use strict';
// Explicit operator action only. This script is NEVER called by npm start.
// Token is loaded from process environment; it is not put in CLI arguments or logs.
const EXPECTED_PATH = '/api/auth/telegram/webhook';
function validateWebhookConfig(env, rawUrl) {
  if (env.NODE_ENV !== 'production' || env.TELEGRAM_UPDATE_MODE !== 'webhook') {
    throw new Error('Production webhook rejimi talab qilinadi.');
  }
  if (!/^([1-9]\d*):[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN || '')) {
    throw new Error('TELEGRAM_BOT_TOKEN konfiguratsiyasi yaroqsiz.');
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(env.TELEGRAM_BOT_USERNAME || '')) {
    throw new Error('TELEGRAM_BOT_USERNAME konfiguratsiyasi yaroqsiz.');
  }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET || '')) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET konfiguratsiyasi yaroqsiz.');
  }
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Webhook HTTPS URL yaroqsiz.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.pathname !== EXPECTED_PATH || url.port ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.local') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
      url.hostname.includes(':')) {
    throw new Error('Faqat tashqi HTTPS /api/auth/telegram/webhook URL ruxsat etiladi.');
  }
  return url.toString();
}
async function configureWebhook({env=process.env, webhookUrl, fetchImpl=fetch}) {
  const url = validateWebhookConfig(env, webhookUrl);
  const body = {
    url,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 1,
    drop_pending_updates: false,
  };
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true || data.result !== true) throw new Error('provider_error');
  } catch {
    // Never print the underlying transport error: it can contain the token URL.
    throw new Error('Telegram webhook sozlash muvaffaqiyatsiz. Telegram API va konfiguratsiyani tekshiring.');
  }
  return true;
}
if (require.main === module) {
  const webhookUrl = process.argv[2];
  configureWebhook({ webhookUrl }).then(() => {
    console.log('Webhook Telegram tomonida sozlandi. Endi haqiqiy OTP smoke-testini bajaring.');
  }, error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { validateWebhookConfig, configureWebhook };
