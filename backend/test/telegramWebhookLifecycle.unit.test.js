const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { createWebhookController } = require('../telegram/webhook');
const { createWebhookLifecycle, webhookPoolOptions } = require('../telegram/webhookLifecycle');
const { createUpdateHandler } = require('../telegram/handler');
const { createBookingStatusService } = require('../services/bookingStatusService');

const env = { TELEGRAM_UPDATE_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: 'unit_lifecycle_secret_'.repeat(3),
  TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot' };
const ordinaryUpdate = { update_id: 7, message: {} };
function callbackUpdate(id = 7) {
  return { update_id: id, callback_query: { id: 'query-' + id, data: 'booking:confirmed:7', from: { id: 42 },
    message: { message_id: 1, chat: { id: 42, type: 'private' }, from: { id: 123, is_bot: true } } } };
}

// Only query results, session locks and transaction storage are simulated.
// Controller, lifecycle, transaction adapter, callback and booking service are real.
function fixture() {
  let state = { receipts: [], status: 'pending', effects: [] }, locked = false;
  const control = { clients: [], queries: [], hang: null, fail: null, technicalBooking: false, businessReject: false,
    invalidBooking: false, apiCalls: [], factory: null, pauseConnect: false, lateConnect: null, holdApi: false, apiSignal: null, apiOnCall: null };
  function makeClient() {
    let local, closed = false, ownsLock = false, pendingReject;
    const points = new Map(), client = new EventEmitter();
    client.releaseCount = 0; client.destroyCount = 0;
    client.connection = { stream: { destroy() { client.destroyCount++; client.emit('end'); } } };
    client.release = destroy => {
      assert.equal(destroy, true); client.releaseCount++; assert.equal(client.releaseCount, 1);
      closed = true; local = null; if (ownsLock) locked = false;
      pendingReject?.(Error('Simulated session destruction cancels active SQL'));
    };
    client.query = async (sql, args = []) => {
      if (closed) throw Error('Query after destruction');
      control.queries.push(sql);
      if (control.hang && sql.includes(control.hang)) return new Promise((_resolve, reject) => { pendingReject = reject; });
      if (control.fail && sql.includes(control.fail)) throw Error('Injected private database error');
      const rows = values => ({ rows: values, rowCount: values.length });
      if (sql.includes('pg_try_advisory_lock')) {
        if (locked) return rows([{ acquired: false }]);
        locked = true; ownsLock = true; return rows([{ acquired: true }]);
      }
      if (sql === 'BEGIN') { local = structuredClone(state); return rows([]); }
      if (sql === 'ROLLBACK') { local = null; return rows([]); }
      if (sql === 'COMMIT') { state = local; local = null; return { ...rows([]), command: 'COMMIT' }; }
      assert.ok(local, 'DB operation needs an outer transaction');
      if (sql.startsWith('SAVEPOINT ')) { points.set(sql.slice(10), structuredClone(local)); return rows([]); }
      if (sql.startsWith('ROLLBACK TO SAVEPOINT ')) { local = structuredClone(points.get(sql.slice(22))); return rows([]); }
      if (sql.startsWith('RELEASE SAVEPOINT ')) { points.delete(sql.slice(18)); return rows([]); }
      if (sql.startsWith('SET LOCAL') || sql.includes('pg_advisory_xact_lock')) return rows([]);
      if (sql.startsWith('SELECT update_id')) return rows(local.receipts.includes(args[1]) ? [{ update_id: args[1] }] : []);
      if (sql.startsWith('INSERT INTO telegram_webhook_receipts')) { local.receipts.push(args[1]); return rows([]); }
      if (sql.startsWith('SELECT t.barber_id')) return rows(control.businessReject ? [] : [{ barber_id: 2 }]);
      if (sql.startsWith('SELECT barber_id FROM bookings')) return rows([{ barber_id: 2 }]);
      if (sql.startsWith('SELECT b.id FROM barbers')) return rows([{ id: 2 }]);
      if (sql.startsWith('SELECT barber_id FROM barber_telegram_links')) return rows([{ barber_id: 2 }]);
      if (sql.startsWith('SELECT bookings.id')) return rows([{ id: 7, status: local.status,
        booking_time: control.invalidBooking ? 'invalid' : new Date(Date.now() + 3600000), duration_minutes: 30 }]);
      if (sql.startsWith('UPDATE bookings SET status')) {
        if (control.technicalBooking) throw Object.assign(Error('Simulated deadlock'), { code: '40P01' });
        assert.equal(local.status, args[3]); local.status = args[0]; local.effects.push(args[0]);
        return rows([{ id: 7, status: local.status }]);
      }
      throw Error('Unexpected modeled SQL');
    };
    control.clients.push(client); return client;
  }
  const pool = { options: { connectionTimeoutMillis: 100 }, async connect() {
    if (control.pauseConnect) return new Promise(resolve => { control.lateConnect = () => resolve(makeClient()); });
    return makeClient();
  } };
  const api = async (method, body, signal) => {
    control.apiCalls.push({ method, body }); control.apiSignal = signal;
    control.apiOnCall?.();
    if (control.holdApi) return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Error('Cancelled Telegram fetch')), { once: true });
    });
    return { message_id: 1, chat: { id: body.chat_id } };
  };
  function controller(deadlines) {
    return createWebhookController({ pool, env, api, deadlines,
      handlerFactory: params => control.factory ? control.factory(params) : createUpdateHandler({ ...params,
        username: env.TELEGRAM_BOT_USERNAME, botId: 123, logger: { error() {} },
        bookings: createBookingStatusService({ pool: params.pool }) }) });
  }
  async function call(update = ordinaryUpdate, deadlines) {
    const res = { calls: 0, set() {}, sendStatus(status) { this.calls++; this.statusCode = status; return this; } };
    await controller(deadlines)({ get: () => env.TELEGRAM_WEBHOOK_SECRET, body: update }, res);
    assert.equal(res.calls, 1); return res.statusCode;
  }
  function cleaned() {
    for (const client of control.clients) {
      assert.equal(client.releaseCount, 1); assert.equal(client.destroyCount, 1);
      assert.equal(client.listenerCount('error'), 0); assert.equal(client.listenerCount('end'), 0);
    }
  }
  return { control, call, cleaned, get state() { return state; } };
}

for (const event of ['error', 'end']) test('Client ' + event + ': 503, bitta destroy, keyingi OTP yuborilmaydi', async () => {
  const f = fixture();
  f.control.factory = ({ otpApi }) => async () => {
    const client = f.control.clients[0];
    client.emit(event, Error('private connection details'));
    client.emit(event, Error('duplicate event'));
    await assert.rejects(async () => otpApi('sendMessage', { chat_id: 42, text: '000123' }));
  };
  assert.equal(await f.call(), 503); assert.equal(f.control.apiCalls.length, 0);
  assert.deepEqual(f.state.receipts, []); f.cleaned();
});
test('Pool connect timeout: 503; kech yetib kelgan client ham destroy qilinadi', async () => {
  const f = fixture(); f.control.pauseConnect = true;
  assert.equal(await f.call(ordinaryUpdate, { connectMs: 10 }), 503);
  assert.equal(f.control.clients.length, 0);
  f.control.lateConnect(); await delay(0); f.cleaned();
  assert.equal(f.control.queries.length, 0); assert.equal(f.control.apiCalls.length, 0);
});
test('Query deadline sessionni destroy qilib active queryni to‘xtatadi', async () => {
  const f = fixture(); f.control.hang = 'SELECT update_id';
  assert.equal(await f.call(ordinaryUpdate, { queryMs: 10 }), 503);
  assert.ok(!f.control.queries.includes('ROLLBACK'), 'No rollback on a destroyed/uncertain session');
  assert.deepEqual(f.state.receipts, []); f.cleaned();
});
test('Umumiy processing deadline osilgan handlerni tugatadi va keyingi SQLni bloklaydi', async () => {
  const f = fixture(); let resume, late;
  f.control.factory = ({ pool, otpApi }) => async () => {
    await new Promise(resolve => { resume = resolve; });
    late = Promise.all([
      assert.rejects(async () => pool.query('SELECT update_id')),
      assert.rejects(async () => otpApi('sendMessage', { chat_id: 42 })),
    ]);
    await late;
  };
  assert.equal(await f.call(ordinaryUpdate, { processingMs: 15 }), 503);
  resume(); await delay(0); await late;
  assert.equal(f.control.apiCalls.length, 0); f.cleaned();
});
test('Deadline in-flight Telegram fetch signalini ham abort qiladi', async () => {
  const f = fixture(); f.control.holdApi = true;
  f.control.factory = ({ otpApi }) => async () => { await otpApi('sendMessage', { chat_id: 42 }); };
  assert.equal(await f.call(ordinaryUpdate, { processingMs: 15 }), 503);
  assert.equal(f.control.apiSignal.aborted, true); assert.equal(f.control.apiCalls.length, 1);
  assert.deepEqual(f.state.receipts, []); f.cleaned();
});
for (const mode of ['timeout', 'error']) test('Outer rollback ' + mode + ': 503 va bitta destroy', async () => {
  const f = fixture(); f.control.factory = () => async () => { throw Error('handler technical failure'); };
  if (mode === 'timeout') f.control.hang = 'ROLLBACK'; else f.control.fail = 'ROLLBACK';
  assert.equal(await f.call(ordinaryUpdate, { rollbackMs: 10 }), 503);
  assert.ok(f.control.queries.includes('ROLLBACK')); assert.deepEqual(f.state.receipts, []); f.cleaned();
});
for (const sql of ['BEGIN', 'SAVEPOINT ', 'RELEASE SAVEPOINT ', 'ROLLBACK TO SAVEPOINT ']) test(sql + ' xatosi scope yoki receiptni commit qilmaydi', async () => {
  const f = fixture(); f.control.fail = sql;
  if (sql.startsWith('ROLLBACK TO')) f.control.businessReject = true;
  assert.equal(await f.call(callbackUpdate()), 503);
  assert.deepEqual(f.state.receipts, []); assert.equal(f.state.status, 'pending'); f.cleaned();
});
test('Booking biznes rad javobi receipt va 200 bilan yakunlanadi', async () => {
  const f = fixture(); f.control.businessReject = true;
  assert.equal(await f.call(callbackUpdate()), 200);
  assert.deepEqual(f.state.receipts, [7]); assert.equal(f.state.status, 'pending');
  assert.match(f.control.apiCalls[0].body.text, /bog‘lanmagan/); f.cleaned();
});
for (const mode of ['raw DB error', 'typed 500']) test('Booking texnik ' + mode + ': receipt yo‘q, 503, keyingi retry muvaffaqiyatli', async () => {
  const f = fixture();
  if (mode === 'raw DB error') f.control.technicalBooking = true; else f.control.invalidBooking = true;
  assert.equal(await f.call(callbackUpdate()), 503);
  assert.deepEqual(f.state.receipts, []); assert.equal(f.state.status, 'pending'); assert.equal(f.control.apiCalls.length, 0);
  f.control.technicalBooking = false; f.control.invalidBooking = false;
  assert.equal(await f.call(callbackUpdate()), 200);
  assert.deepEqual(f.state.effects, ['confirmed']); f.cleaned();
});
test('Bir xil update va yangi update ichidagi takroriy callback bookingni ikki marta o‘zgartirmaydi', async () => {
  const f = fixture(); assert.equal(await f.call(callbackUpdate()), 200);
  const queries = f.control.queries.length;
  assert.equal(await f.call(callbackUpdate()), 200);
  assert.ok(f.control.queries.slice(queries).every(sql => !sql.includes('UPDATE bookings')));
  assert.equal(await f.call(callbackUpdate(8)), 200);
  assert.deepEqual(f.state.effects, ['confirmed']); assert.deepEqual(f.state.receipts, [7, 8]);
  assert.ok(f.control.apiCalls.some(call => /allaqachon/.test(call.body.text || ''))); f.cleaned();
});
test('Lifecycle dispose va abort idempotent; listenerlar tozalanadi', async () => {
  const lifecycle = createWebhookLifecycle();
  const client = Object.assign(new EventEmitter(), { releases: 0, release(destroy) { assert.equal(destroy, true); this.releases++; } });
  await lifecycle.acquire({ connect: async () => client });
  client.emit('error', Error('private')); client.emit('end');
  assert.equal(lifecycle.connectionLost, true);
  lifecycle.dispose(); lifecycle.dispose(); lifecycle.abort('again');
  assert.equal(client.releases, 1); assert.equal(client.listenerCount('error'), 0); assert.equal(client.listenerCount('end'), 0);
});
test('Post-commit connection-loss: receipt saqlanadi, keyingi bot xabari boshlanmaydi', async () => {
  const f = fixture();
  f.control.factory = ({ api }) => async () => {
    await api('sendMessage', { chat_id: 42, text: 'first' });
    await api('sendMessage', { chat_id: 42, text: 'second' });
  };
  f.control.apiOnCall = () => f.control.clients[0].emit('error', Error('connection lost'));
  assert.equal(await f.call(), 503);
  assert.deepEqual(f.state.receipts, [7]); assert.equal(f.control.apiCalls.length, 1); f.cleaned();
  assert.equal(await f.call(), 200); assert.equal(f.control.apiCalls.length, 1); f.cleaned();
});
test('COMMIT query deadline ham receiptni mahalliy modelda rollback qiladi', async () => {
  const f = fixture(); f.control.hang = 'COMMIT';
  assert.equal(await f.call(ordinaryUpdate, { queryMs: 10 }), 503);
  assert.deepEqual(f.state.receipts, []); assert.equal(f.control.apiCalls.length, 0); f.cleaned();
});
test('HTTP abort lifecycle signalini bekor qiladi va listenerlar dispose paytida olinadi', async () => {
  const lifecycle = createWebhookLifecycle(), req = new EventEmitter(), res = new EventEmitter();
  lifecycle.watchRequest(req, res); req.emit('aborted');
  assert.equal(lifecycle.signal.aborted, true); assert.throws(lifecycle.assertActive);
  lifecycle.dispose(); assert.equal(req.listenerCount('aborted'), 0); assert.equal(res.listenerCount('close'), 0);
});
test('Native checkout timeoutisiz real pool konfiguratsiyasi yopiq rad etiladi', async () => {
  const lifecycle = createWebhookLifecycle(); let connects = 0;
  try { await assert.rejects(lifecycle.acquire({ options: {}, connect() { connects++; } }), { code: 'webhook_pool_timeout_missing' }); }
  finally { lifecycle.dispose(); }
  assert.equal(connects, 0);
});
test('Webhook pool yashirilgan credentialni saqlaydi va umumiy pool sozlamasini o‘zgartirmaydi', () => {
  const source = { max: 10, ssl: { rejectUnauthorized: true } };
  Object.defineProperty(source, 'password', { value: 'fake-unit-password', enumerable: false, configurable: true, writable: true });
  const options = webhookPoolOptions(source);
  assert.equal(options.password, source.password); assert.equal(Object.getOwnPropertyDescriptor(options, 'password').enumerable, false);
  assert.equal(options.connectionTimeoutMillis, 2000); assert.equal(options.max, 2); assert.equal(options.pipeline, false);
  assert.equal(source.max, 10); assert.equal(source.connectionTimeoutMillis, undefined);
  assert.equal(JSON.stringify(options).includes('fake-unit-password'), false);
});
