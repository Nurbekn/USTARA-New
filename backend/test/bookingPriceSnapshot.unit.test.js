'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectedPriceMatches, attachBookingServices } = require('../services/bookingSelection');
const { createMultiBooking } = require('../services/multiBooking');

test('narx mijoz tasdiqlagan summaga to‘g‘ri kelsagina qabul qilinadi', () => {
  assert.equal(expectedPriceMatches('75000.00', '75000.00'), true);
  assert.equal(expectedPriceMatches(75000, '75000.00'), true);
  assert.equal(expectedPriceMatches('75000.00', '80000.00'), false);
  assert.equal(expectedPriceMatches('75000.01', '75000.00'), false);
  assert.equal(expectedPriceMatches(undefined, '75000.00'), true); // backward compatible
  for (const invalid of ['0', '-10', '100.999', '1e3', 'Infinity', {}, ' 70000 ', '99999999999.00']) {
    assert.throws(() => expectedPriceMatches(invalid, '75000.00'), { status: 400, code: 'invalid_expected_price' });
  }
});

test('bron ro‘yxati eski nom va saqlangan narxni katalogdagi yangi nomdan ustun qo‘yadi', async () => {
  const rows = [
    { id: 11, service_name: 'Yangi katalog nomi', total_price: '50000.00' },
    { id: 12, service_name: 'Hozirgi katalog', total_price: null },
  ];
  const database = { async query(sql, params) {
    if (sql.includes('to_regclass')) return { rows: [{ ready: true }] };
    assert.deepEqual(params, [[11, 12]]);
    return { rows: [
      { booking_id: 11, id: 3, name: 'Bron paytidagi soch olish', price: '50000.00', duration_minutes: 30 },
    ] };
  } };
  const response = await attachBookingServices(rows, database);
  assert.equal(response[0].service_name, 'Bron paytidagi soch olish');
  assert.equal(response[0].total_price, '50000.00');
  assert.deepEqual(response[0].services, [{ id: 3, name: 'Bron paytidagi soch olish', price: '50000.00', duration_minutes: 30 }]);
  assert.equal(response[1].service_name, 'Hozirgi katalog');
  assert.deepEqual(response[1].services, []);
  assert.equal(response[1].total_price, null, 'eski bron narxi taxminan to‘ldirilmaydi');
  assert.equal(rows[0].service_name, 'Yangi katalog nomi', 'original rows mutate qilinmaydi');
});

test('narx o‘zgarib ketganda server tranzaksiyani bekor qiladi, bron yaratmaydi', async () => {
  const statements = [];
  let released = false;
  const client = { async query(sql, args = []) {
    statements.push(sql);
    if (sql.startsWith('SELECT user_id FROM customers')) return { rows: [{ user_id: 11 }], rowCount: 1 };
    if (sql.startsWith("SELECT id FROM users WHERE id=$1 AND role='customer'")) return { rows: [{ id: 11 }], rowCount: 1 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.startsWith('SELECT verification_status')) return { rows: [{ verification_status: 'approved', accepting_bookings: true, now: new Date('2026-11-18T08:00:00Z') }], rowCount: 1 };
    if (sql.startsWith('SELECT user_id FROM barbers')) return { rows: [{ user_id: 22 }], rowCount: 1 };
    if (sql.startsWith('SELECT id FROM users WHERE id=$1 AND deactivated_at')) return { rows: [{ id: 22 }], rowCount: 1 };
    if (sql.startsWith('SELECT id,name,price,duration_minutes')) return { rows: [{ id: 3, name: 'Soch', price: '60000.00', duration_minutes: 30 }], rowCount: 1 };
    if (/^(BEGIN|ROLLBACK|SET LOCAL)/.test(sql)) return { rows: [] };
    throw new Error(`Unexpected query ${sql}`);
  }, release() { released = true; } };
  await assert.rejects(
    createMultiBooking({ connect: async () => client }, { role: 'customer', profileId: 1, accountId: 11 }, {
      barber_id: 2, service_ids: [3], booking_time: '2030-01-07T10:00:00+05:00', expected_total_price: '50000.00',
    }), { status: 409, code: 'price_changed' }
  );
  assert.ok(statements.includes('ROLLBACK'));
  assert.equal(statements.some(s => s.includes('INSERT INTO bookings')), false);
  assert.equal(released, true);
});
