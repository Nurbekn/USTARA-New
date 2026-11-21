'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { expectedDurationMatches, selectedServices } = require('../services/bookingSelection');
const { createMultiBooking, multiSlots } = require('../services/multiBooking');
const { bookingDbConflict } = require('../services/bookingDbConflicts');

// No real database or Telegram service is loaded by these unit tests.
for (const quote of [undefined, null, 30, 1200]) {
  test('duration quote accepted when absent or equal: ' + String(quote), () => {
    assert.equal(expectedDurationMatches(quote, quote ?? 30), true);
  });
}
test('duration mismatch is not accepted as a successful quote', () => {
  assert.equal(expectedDurationMatches(30, 45), false);
  assert.equal(expectedDurationMatches(45, 30), false);
});
for (const value of [0, -5, 3, 30.5, 1205, '30', {}, NaN, Infinity]) {
  test('invalid duration quote rejected before DB access: ' + String(value), () => {
    assert.throws(() => expectedDurationMatches(value, 30), { status: 400, code: 'invalid_expected_duration' });
  });
}
for (const pgCode of ['55P03', '57014']) {
  test('temporary lock/statement timeout has retryable safe HTTP semantics: ' + pgCode, () => {
    const error = bookingDbConflict({ code: pgCode, detail: 'private-connection-string' });
    assert.equal(error.status, 409);
    assert.equal(error.code, 'booking_busy');
    assert.doesNotMatch(error.message, /private/);
  });
}
test('other database errors are not mislabeled as booking conflicts', () => {
  assert.equal(bookingDbConflict({ code: '23503' }), null);
  assert.equal(bookingDbConflict({ code: '42P01' }), null);
});

function fixture() {
  const statements = [];
  let released = null;
  const client = {
    async query(sql, args = []) {
      statements.push([sql, args]);
      if (sql.startsWith('SELECT user_id FROM customers')) return { rowCount: 1, rows: [{ user_id: 11 }] };
      if (sql.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'")) return { rowCount: 1, rows: [{ id: 11 }] };
      if (sql.startsWith('SELECT verification_status')) return { rowCount: 1, rows: [{ verification_status: 'approved', accepting_bookings: true, now: new Date('2026-11-18T07:00:00Z') }] };
      if (sql.startsWith('SELECT user_id FROM barbers')) return { rowCount: 1, rows: [{ user_id: 22 }] };
      if (sql.startsWith('SELECT id FROM users WHERE id=$1 AND deactivated')) return { rowCount: 1, rows: [{ id: 22 }] };
      if (sql.startsWith('SELECT id,name,price,duration_minutes')) return { rowCount: 1, rows: [{ id: 3, name: 'Soch olish', price: '70000.00', duration_minutes: 45 }] };
      if (/^(BEGIN|ROLLBACK|SET LOCAL|SELECT pg_advisory_xact_lock)/.test(sql)) return { rowCount: 0, rows: [] };
      throw new Error('Unexpected query: ' + sql);
    },
    release(broken) { released = broken ?? false; },
  };
  return { pool: { connect: async () => client }, statements, get released() { return released; } };
}
test('changed duration rejects booking after service row lock, before any booking INSERT', async () => {
  const f = fixture();
  await assert.rejects(createMultiBooking(f.pool,
    { role: 'customer', profileId: 1, accountId: 11 },
    { barber_id: 2, service_ids: [3], booking_time: '2030-01-07T10:00:00+05:00', expected_total_price: '70000.00', expected_duration_minutes: 30 }),
  { status: 409, code: 'duration_changed' });
  const sql = f.statements.map(([s]) => s);
  assert.ok(sql.some(s => s.startsWith('SELECT pg_advisory_xact_lock')));
  assert.ok(sql.some(s => s.startsWith('SELECT id,name,price,duration_minutes') && s.includes('FOR SHARE')));
  assert.equal(sql.some(s => s.includes('INSERT INTO bookings')), false);
  assert.equal(sql.at(-1), 'ROLLBACK');
  assert.equal(f.released, false);
});
test('same duration with malformed quote rolls back without inserting', async () => {
  const f = fixture();
  await assert.rejects(createMultiBooking(f.pool,
    { role: 'customer', profileId: 1, accountId: 11 },
    { barber_id: 2, service_ids: [3], booking_time: '2030-01-07T10:00:00+05:00', expected_total_price: '70000.00', expected_duration_minutes: '45' }),
  { status: 400, code: 'invalid_expected_duration' });
  assert.equal(f.statements.at(-1)[0], 'ROLLBACK');
});
test('invalid barber ID cannot enter a multi-booking transaction', async () => {
  const notUsed = { connect() { throw Error('no database access'); } };
  await assert.rejects(createMultiBooking(notUsed, { role: 'customer', profileId: 1 },
    { barber_id: 2147483648, service_ids: [3], booking_time: '2030-01-07T10:00:00+05:00' }), { status: 400 });
});
test('invalid actor ID cannot enter a multi-booking transaction', async () => {
  const notUsed = { connect() { throw Error('no database access'); } };
  await assert.rejects(createMultiBooking(notUsed, { role: 'customer', profileId: 2147483648 },
    { barber_id: 2, service_ids: [3], booking_time: '2030-01-07T10:00:00+05:00' }), { status: 401, code: 'invalid_session' });
});
test('multi-service availability rejects int4-outside barber IDs without DB access', async () => {
  await assert.rejects(multiSlots({ connect() { throw Error('database must not be used'); } },
    { barber_id: '2147483648', service_ids: [3], date: '2030-01-07' }), { status: 400 });
});

test('legacy creation refuses to bypass a quoted price/duration when migration missing', async () => {
  const dbPath = require.resolve('../db');
  const old = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  const { createBooking, getAvailableSlots } = require('../controllers/bookingsController');
  try {
    for (const quote of [{ expected_total_price: '70000.00' }, { expected_duration_minutes: 45 }]) {
      let connected = false;
      const db = { query: async sql => {
        assert.match(sql, /to_regclass\('booking_services'\)/);
        return { rowCount: 1, rows: [{ ready: false }] };
      }, connect() { connected = true; throw Error('legacy INSERT must not run'); } };
      const req = { user: { role: 'customer', profileId: 1 }, body: { barber_id: 2, service_id: 3,
        booking_time: '2030-01-07T10:00:00+05:00', ...quote } };
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await createBooking(req, res, null, db);
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.code, 'migration_required');
      assert.equal(connected, false);
    }
    const resp = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await getAvailableSlots({ query: { barber_id: '2147483648', service_id: '3', date: '2030-01-07' } }, resp);
    assert.equal(resp.statusCode, 400);
  } finally {
    if (old) require.cache[dbPath] = old;
    else delete require.cache[dbPath];
  }
});

test('availability declares no-store to prevent stale prices and slots', async () => {
  const dbPath = require.resolve('../db');
  const old = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  const { getAvailableSlots } = require('../controllers/bookingsController');
  try {
    const headers = {};
    const res = { statusCode: 200, set(k,v) { headers[k]=v; return this; }, status(code) { this.statusCode=code; return this; }, json(body) { this.body=body; return this; } };
    await getAvailableSlots({ query: { barber_id: '0', service_id: '3', date: '2030-01-07' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(headers['Cache-Control'], 'no-store');
  } finally {
    if (old) require.cache[dbPath] = old;
    else delete require.cache[dbPath];
  }
});
