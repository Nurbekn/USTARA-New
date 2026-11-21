'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { bookingDbConflict } = require('../services/bookingDbConflicts');
const { createMultiBooking } = require('../services/multiBooking');

const dbPath = require.resolve('../db');
const oldDb = require.cache[dbPath];
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
const { setServiceStatus, refreshServiceData } = require('../controllers/servicesController');
after(() => { if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath]; });

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    set() { return this; },
  };
}
function barberReq() {
  return { user: { role: 'barber', profileId: 4 }, params: { id: '5' }, body: { is_active: false } };
}
function mockedPool({ failCode, rollbackFails = false, failAt = 'UPDATE services' }) {
  const statements = [];
  const released = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql === 'ROLLBACK' && rollbackFails) throw Error('socket closed');
      if (sql.startsWith(failAt)) {
        const error = Error('private-PG-detail'); error.code = failCode; throw error;
      }
      if (sql.startsWith('SELECT id,verification_status FROM barbers')) return { rowCount: 1, rows: [{ verification_status: 'approved' }] };
      if (sql.includes("to_regclass('booking_services')")) return { rowCount: 1, rows: [{ ready: true }] };
      return { rowCount: 1, rows: [] };
    },
    release(discard) { released.push(discard); },
  };
  return { pool: { connect: async () => client }, statements, released };
}
for (const code of ['55P03', '57014', '40P01', '40001']) {
  test('PostgreSQL transient ' + code + ' maps to retryable and non-leaking 409', () => {
    const error = bookingDbConflict({ code, detail: 'secret-database-credentials' });
    assert.equal(error.status, 409);
    assert.equal(error.code, 'booking_busy');
    assert.doesNotMatch(error.message, /secret|credentials/i);
  });
  test('service status transaction '+code+' rolls back, responds 409', async () => {
    const { pool, statements, released } = mockedPool({ failCode: code });
    const res = response();
    await setServiceStatus(barberReq(), res, null, pool);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'booking_busy');
    assert.equal(statements.at(-1), 'ROLLBACK');
    assert.equal(statements.includes('COMMIT'), false);
    assert.deepEqual(released, [false]);
    assert.doesNotMatch(JSON.stringify(res.body), /private-PG-detail/);
  });
  test('service editor '+code+' rolls back before responding', async () => {
    const { pool, statements, released } = mockedPool({ failCode: code });
    const res = response();
    await refreshServiceData({ ...barberReq(), body: { name: 'Soch olish', price: 42000, duration_minutes: 30 } }, res, null, pool);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'booking_busy');
    assert.equal(statements.at(-1), 'ROLLBACK');
    assert.deepEqual(released, [false]);
  });
}
for (const handler of ['status', 'edit']) {
  test(handler + ' discards connection when ROLLBACK fails', async () => {
    const { pool, released } = mockedPool({ failCode: '40P01', rollbackFails: true });
    const res = response();
    if (handler === 'status') await setServiceStatus(barberReq(), res, null, pool);
    else await refreshServiceData({ ...barberReq(), body: { name: 'Soch olish', price: 42000, duration_minutes: 30 } }, res, null, pool);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(released, [true]);
  });
}
for (const code of ['40P01', '40001']) {
  test('multi-booking fails closed on database '+code+', ROLLBACK and release', async () => {
    const statements = [], released = [];
    const db = { connect: async () => ({
      async query(sql) {
        statements.push(sql);
        if (sql.startsWith('SELECT user_id FROM customers')) {
          const e = Error('secret PG detail'); e.code = code; throw e;
        }
        return { rows: [], rowCount: 1 };
      },
      release(discard) { released.push(discard); },
    }) };
    await assert.rejects(createMultiBooking(db,
      { role:'customer', profileId: 11, accountId: 100 },
      { barber_id: 7, service_ids: [8], booking_time:'2035-01-01T12:00:00+05:00' }),
    e => e.status===409 && e.code==='booking_busy' && !e.message.includes('secret'));
    assert.equal(statements.at(-1), 'ROLLBACK');
    assert.deepEqual(released, [false]);
  });
}
test('unrelated SQL errors remain distinct, never mislabeled as retryable', () => {
  for (const code of ['23503', '23505', '42P01', '42501', undefined])
    assert.equal(bookingDbConflict({ code }), null);
});

// Read-only slot queries can also be interrupted by deadlocks or serializable
// transaction retries. They must discard uncertain connections and emit a
// stable error code, not a generic 500 or PostgreSQL diagnostic string.
const { multiSlots } = require('../services/multiBooking');
const { modificationSlots } = require('../services/bookingModification');
for (const pgCode of ['40P01', '40001', '55P03', '57014']) {
  for (const method of ['public', 'modify']) {
    test(method + ' slots ' + pgCode + ' uses safe retry semantics', async () => {
      const calls = [], released = [];
      const pool = { connect: async () => ({
        async query(sql) {
          calls.push(sql);
          if (/^SELECT/.test(sql)) {
            const err = Error('secret-SQL-data'); err.code=pgCode; throw err;
          }
          return { rows: [], rowCount: 0 };
        },
        release(discard) { released.push(discard); },
      }) };
      const load = method === 'public'
        ? multiSlots(pool, { barber_id: '2', service_ids: [3], date: '2035-01-01' })
        : modificationSlots(pool, { role: 'customer', profileId: 1, accountId: 100 }, 4, '2035-01-01');
      await assert.rejects(load,
        e => e.status===409 && e.code==='booking_busy' && !e.message.includes('secret'));
      assert.equal(calls.at(-1), 'ROLLBACK');
      assert.deepEqual(released, [false]);
    });
  }
}
