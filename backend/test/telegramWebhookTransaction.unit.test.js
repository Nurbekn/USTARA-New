const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createWebhookController } = require('../telegram/webhook');
const { createUpdateHandler } = require('../telegram/handler');
const { createTransactionPool } = require('../telegram/transactionPool');
const env = { TELEGRAM_UPDATE_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: 'unit_secret_'.repeat(4),
  TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot' };
const response = () => ({ set() {}, sendStatus(code) { this.statusCode = code; return this; } });

// In-memory transaction model, NOT PostgreSQL. State survives controller recreation.
function fixture() {
  let state = { receipts: [], effects: [] }, locked = false;
  const control = { fault: null, hold: null, entered: null, calls: 0, replies: 0, failReply: false };
  const pool = { async connect() {
    let local = null, ownsLock = false;
    const points = new Map();
    return Object.assign(new EventEmitter(), {
      release(destroy) { assert.equal(destroy, true); local = null; if (ownsLock) locked = false; },
      async query(sql, args = []) {
        if (sql.includes('pg_try_advisory_lock')) {
          if (locked) return { rows: [{ acquired: false }] };
          locked = true; ownsLock = true; return { rows: [{ acquired: true }] };
        }
        if (sql === 'BEGIN') { assert.equal(local, null); local = structuredClone(state); return { rows: [] }; }
        if (sql === 'COMMIT') {
          if (control.fault === 'aborted_commit') {
            control.fault = null; local = null; return { rows: [], command: 'ROLLBACK' };
          }
          assert.ok(local); state = local; local = null;
          if (control.fault === 'commit_reply') { control.fault = null; throw Error('Simulated lost commit response'); }
          return { rows: [], command: 'COMMIT' };
        }
        if (sql === 'ROLLBACK') { local = null; return { rows: [] }; }
        assert.ok(local, 'All business writes and receipts require the outer transaction');
        if (sql.startsWith('SAVEPOINT ')) { points.set(sql.slice(10), structuredClone(local)); return { rows: [] }; }
        if (sql.startsWith('ROLLBACK TO SAVEPOINT ')) { local = structuredClone(points.get(sql.slice(22))); return { rows: [] }; }
        if (sql.startsWith('RELEASE SAVEPOINT ')) { points.delete(sql.slice(18)); return { rows: [] }; }
        if (sql.startsWith('SELECT update_id')) return { rows: local.receipts.includes(args[1]) ? [{ update_id: args[1] }] : [] };
        if (sql.startsWith('INSERT INTO telegram_webhook_receipts')) {
          if (control.fault === 'receipt') { control.fault = null; throw Error('Simulated interruption after handler'); }
          local.receipts.push(args[1]); return { rows: [] };
        }
        if (sql === 'UNIT BUSINESS EFFECT') { local.effects.push(args[0]); return { rows: [] }; }
        throw Error('Unexpected modeled SQL');
      },
    });
  } };
  const factory = ({ pool, api }) => createUpdateHandler({ username: env.TELEGRAM_BOT_USERNAME, api, contacts: {},
    registration: { async contact(message) {
      control.calls++;
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); await client.query('UNIT BUSINESS EFFECT', [message.contact.phone_number]); await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      assert.equal(state.effects.length, 0, 'Service COMMIT is only a SAVEPOINT release');
      control.entered?.(); if (control.hold) await control.hold;
      return { body: { code: 'otp_sent' } };
    } },
  });
  const controller = () => createWebhookController({ pool, env, handlerFactory: factory, api: async () => {
    control.replies++; if (control.failReply) throw Error('Private transport error');
    return { message_id: 1, chat: { id: 42 } };
  } });
  const request = () => ({ get: () => env.TELEGRAM_WEBHOOK_SECRET, body: { update_id: 7,
    message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, contact: { user_id: 42, phone_number: '998901234567' } } } });
  return { control, controller, request, get state() { return state; } };
}
test('Bir xil parallel update: bitta DB amali, ikkinchi so‘rov 503 va keyin receipt orqali 200', async () => {
  const f = fixture(); let unlock, entered;
  f.control.hold = new Promise(resolve => { unlock = resolve; });
  const ready = new Promise(resolve => { entered = resolve; }); f.control.entered = entered;
  const first = response(), firstCall = f.controller()(f.request(), first); await ready;
  const second = response(); await f.controller()(f.request(), second); assert.equal(second.statusCode, 503);
  unlock(); await firstCall; assert.equal(first.statusCode, 200);
  const retry = response(); await f.controller()(f.request(), retry);
  assert.equal(retry.statusCode, 200); assert.equal(f.control.calls, 1); assert.equal(f.state.effects.length, 1);
});
test('Handlerdan keyin receipt oldidagi uzilish: DB amallari rollback, restart retryda bitta commit', async () => {
  const f = fixture(); f.control.fault = 'receipt';
  const interrupted = response(); await f.controller()(f.request(), interrupted);
  assert.equal(interrupted.statusCode, 503); assert.deepEqual(f.state, { receipts: [], effects: [] }); assert.equal(f.control.replies, 0);
  const restarted = response(); await f.controller()(f.request(), restarted);
  assert.equal(restarted.statusCode, 200); assert.equal(f.control.calls, 2);
  assert.equal(f.state.effects.length, 1); assert.deepEqual(f.state.receipts, [7]);
});
test('Commit javobi yo‘qolib server qayta yaratilsa ham biznes amali takror commit qilinmaydi', async () => {
  const f = fixture(); f.control.fault = 'commit_reply';
  const interrupted = response(); await f.controller()(f.request(), interrupted); assert.equal(interrupted.statusCode, 503);
  const restarted = response(); await f.controller()(f.request(), restarted);
  assert.equal(restarted.statusCode, 200); assert.equal(f.control.calls, 1); assert.equal(f.state.effects.length, 1);
  assert.equal(f.control.replies, 0, 'Commitdan keyingi javob yo‘qolishi mumkin; durable outbox yo‘q');
});
test('Oddiy Telegram javobi xatosi commit qilingan biznes amalini qaytarmaydi', async () => {
  const f = fixture(); f.control.failReply = true;
  const first = response(); await f.controller()(f.request(), first); assert.equal(first.statusCode, 200);
  await f.controller()(f.request(), response());
  assert.equal(f.control.calls, 1); assert.equal(f.state.effects.length, 1); assert.equal(f.control.replies, 1);
});
test('COMMIT o‘rnidagi ROLLBACK natijasi muvaffaqiyat deb olinmaydi', async () => {
  const f = fixture(); f.control.fault = 'aborted_commit';
  const rejected = response(); await f.controller()(f.request(), rejected);
  assert.equal(rejected.statusCode, 503); assert.deepEqual(f.state, { receipts: [], effects: [] }); assert.equal(f.control.replies, 0);
  const retry = response(); await f.controller()(f.request(), retry); assert.equal(retry.statusCode, 200);
  assert.equal(f.state.effects.length, 1);
});
test('SAVEPOINT rollback va lease himoyasi tashqi transactionni commit qilmaydi', async () => {
  const sql = [], pool = createTransactionPool({ async query(q) { sql.push(q); return { rows: [] }; } });
  const client = await pool.connect(); await client.query('BEGIN');
  await assert.rejects(pool.connect());
  await client.query('ROLLBACK'); client.release(); pool.assertComplete();
  assert.deepEqual(sql, ['SAVEPOINT telegram_service_1', 'ROLLBACK TO SAVEPOINT telegram_service_1', 'RELEASE SAVEPOINT telegram_service_1']);
  const leaked = await pool.connect(); await leaked.query('BEGIN'); leaked.release();
  assert.throws(() => pool.assertComplete());
});
