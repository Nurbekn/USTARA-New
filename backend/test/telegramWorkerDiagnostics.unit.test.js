const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { runWorker, failureHint } = require('../telegram/worker');
const { TelegramApiError } = require('../telegram/api');
const env = { TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot' };

test('worker diagnostics classify known failures without exposing raw messages or credentials', () => {
  for (const [code, expected] of [
    ['configuration', /TELEGRAM_BOT_TOKEN/], ['telegram_unavailable', /TELEGRAM_BOT_USERNAME/],
    ['worker_database_configuration', /DB_HOST/], ['transport', /HTTPS/],
    [401, /tokenini rad etdi/], [409, /polling to‘qnashuvi/],
    ['28P01', /login yoki parolni/], ['28000', /pg_hba/], ['3D000', /bazasi mavjud emas/],
    ['42501', /ruxsat yo‘q/], ['42P01', /jadvali mavjud emas/], ['42703', /ustuni mavjud emas/],
    ['23505', /unique/], ['ECONNREFUSED', /ulanishi rad etildi/], ['otp_unavailable', /OTP_HMAC_KEY/],
  ]) {
    const error = Object.assign(Error('private-password https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN), {
      code, workerStage: 'update_processing', detail: 'private-detail', cause: Error('private-cause'),
    });
    const hint = failureHint(error);
    assert.match(hint, expected); assert.match(hint, /^Telegram xabarini qayta ishlash:/);
    assert.doesNotMatch(hint, /private-|https:|xxx/);
  }
  const unknown = failureHint({ code: 'private-code', workerStage: 'private-stage', message: 'private-message' });
  assert.match(unknown, /Kutilmagan worker xatosi/); assert.doesNotMatch(unknown, /private-/);
});

function poolFixture(failAt) {
  let released = false;
  const client = Object.assign(new EventEmitter(), { release(destroy) { assert.equal(destroy, true); released = true; }, async query(sql) {
    if (failAt === 'database_lock' && sql.includes('pg_try_advisory_lock')) throw Object.assign(Error('private'), { code: '42501' });
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] };
    if (failAt === 'database_cursor' && sql.startsWith('INSERT INTO telegram_bot_state')) throw Object.assign(Error('private'), { code: '42P01' });
    if (sql.startsWith('SELECT next_update_id')) return { rows: [{ next_update_id: '0' }] };
    return { rows: [] };
  } });
  return { pool: { async connect() {
    if (failAt === 'database_connect') throw Object.assign(Error('private password'), { code: '28P01' });
    return client;
  } }, get released() { return released; } };
}

test('worker retains startup/polling failure code and exact stage while releasing its lock connection', async () => {
  for (const stage of ['database_connect', 'database_lock', 'telegram_identity', 'telegram_webhook', 'database_cursor', 'telegram_polling']) {
    const f = poolFixture(stage);
    const api = async method => {
      if (stage === 'telegram_identity' && method === 'getMe') throw new TelegramApiError('transport');
      if (method === 'getMe') return { id: 123, is_bot: true, username: env.TELEGRAM_BOT_USERNAME };
      if (stage === 'telegram_webhook' && method === 'getWebhookInfo') throw new TelegramApiError(401);
      if (method === 'getWebhookInfo') return { url: '' };
      if (method === 'getUpdates') throw new TelegramApiError(409);
      assert.fail('Kutilmagan Telegram amali');
    };
    await assert.rejects(runWorker({ pool: f.pool, env, api }), error => {
      assert.equal(error.workerStage, stage);
      if (stage === 'telegram_polling') assert.equal(error.code, 409);
      assert.doesNotMatch(failureHint(error), /private|xxx/);
      return true;
    });
    assert.equal(f.released, stage !== 'database_connect');
  }
});
