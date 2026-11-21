'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const overrides = [
  ['../db', { query: async () => { throw Error('Unexpected real database access'); } }],
  ['../controllers/registrationController', { registrationRequired: () => {} }],
  ['../services/loginAuthentication', { createRoleLogin: () => () => {} }],
  ['../services/accountDeletionService', {
    AccountDeletionError: class AccountDeletionError extends Error {},
    createAccountDeletionService: () => ({ deleteAccount: async () => {} }),
  }],
];
const previous = overrides.map(([name, exports]) => {
  const file = require.resolve(name);
  const old = require.cache[file];
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
  return { file, old };
});
const { getCustomers, takeCustomerById } = require('../controllers/customersController');
after(() => { for (const { file, old } of previous) {
  if (old) require.cache[file] = old;
  else delete require.cache[file];
} });

function response() {
  return {
    code: 200, headers: {}, body: undefined,
    status(code) { this.code = code; return this; },
    set(header, value) { this.headers[header] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}
const allFields = {
  id: 15, first_name: 'Mijoz', last_name: 'Test',
  phone: '+998901112233', created_at: '2030-01-01',
  password: 'bad data', user_id: 151, reset_secret: 'never return',
};
const onlyPublicCustomer = {
  id: 15, first_name: 'Mijoz', last_name: 'Test', created_at: '2030-01-01',
};
const barber = { role: 'barber', profileId: 9 };
const admin = { role: 'admin', profileId: 3 };

for (const role of ['customer', 'guest', undefined]) {
  test(`v88: ${String(role)} cannot browse customer directory`, async () => {
    const res = response();
    await getCustomers({ user: role === undefined ? undefined : { role } }, res, undefined,
      { query: async () => assert.fail('DB should not be queried') });
    assert.equal(res.code, 403);
    assert.equal(res.headers['Cache-Control'], 'no-store');
  });
}

test('v88: barber directory is limited to its own booking associations', async () => {
  const statements = [];
  const res = response();
  await getCustomers({ user: barber }, res, undefined, { query: async (sql, values) => {
    statements.push(sql);
    assert.deepEqual(values, [9]);
    assert.match(sql, /JOIN bookings b ON b\.customer_id=c\.id/);
    assert.match(sql, /WHERE b\.barber_id=\$1/);
    assert.doesNotMatch(sql.split(/\bFROM\b/i)[0], /phone/i);
    return { rows: [allFields], rowCount: 1 };
  } });
  assert.equal(statements.length, 1);
  assert.deepEqual(res.body, [onlyPublicCustomer]);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('v88: admin directory retains phone for account management', async () => {
  const res = response();
  await getCustomers({ user: admin }, res, undefined, { query: async (sql) => {
    assert.match(sql, /u\.phone/);
    return { rows: [allFields], rowCount: 1 };
  } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body[0], { ...onlyPublicCustomer, phone: '+998901112233' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

for (const bad of [0, -1, 2147483648, 'not-a-number', null]) {
  test(`v88: invalid barber session ID '${String(bad)}' blocks directory`, async () => {
    const res = response();
    await getCustomers({ user: { role: 'barber', profileId: bad } }, res, undefined,
      { query: async () => assert.fail('DB should not be queried') });
    assert.equal(res.code, 401);
  });
}

test('v88: barber customer detail first proves own booking, then excludes phone', async () => {
  const calls = [];
  const res = response();
  await takeCustomerById({ user: barber, params: { id: '15' } }, res, undefined,
    { query: async (sql, values) => {
      calls.push(sql);
      if (calls.length === 1) {
        assert.match(sql, /WHERE customer_id = \$1\s+AND barber_id = \$2/);
        assert.deepEqual(values, [15, 9]);
        return { rowCount: 1, rows: [{ '?column?': 1 }] };
      }
      assert.deepEqual(values, [15]);
      assert.doesNotMatch(sql.split(/\bFROM\b/i)[0], /phone|password|user_id/i);
      return { rowCount: 1, rows: [allFields] };
    } });
  assert.equal(calls.length, 2);
  assert.deepEqual(res.body, onlyPublicCustomer);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('v88: unrelated barber cannot retrieve customer detail', async () => {
  let calls = 0;
  const res = response();
  await takeCustomerById({ user: barber, params: { id: '15' } }, res, undefined, {
    query: async () => { calls++; return { rowCount: 0, rows: [] }; },
  });
  assert.equal(res.code, 403);
  assert.equal(calls, 1);
});

test('v88: admin may still access customer phone on detail view', async () => {
  const res = response();
  await takeCustomerById({ user: admin, params: { id: '15' } }, res, undefined, {
    query: async (sql, values) => {
      assert.match(sql, /u\.phone/);
      assert.deepEqual(values, [15]);
      return { rows: [allFields], rowCount: 1 };
    },
  });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ...onlyPublicCustomer, phone: '+998901112233' });
});

for (const badId of ['-5', '2147483648', '5.5', 'abc', '0', '0x10', '1e2', '01']) {
  test(`v88: invalid customer ID '${badId}' rejected before DB`, async () => {
    const res = response();
    await takeCustomerById({ user: barber, params: { id: badId } }, res, undefined,
      { query: async () => assert.fail('DB should not be queried') });
    assert.equal(res.code, 400);
  });
}

test('v88: unauthorized caller cannot look up an individual customer', async () => {
  const res = response();
  await takeCustomerById({ user: { role: 'customer' }, params: { id: '15' } }, res, undefined,
    { query: async () => assert.fail('DB should not be queried') });
  assert.equal(res.code, 403);
});

test('v88: missing customer yields 404 without leaking phone', async () => {
  const res = response();
  await takeCustomerById({ user: barber, params: { id: '15' } }, res, undefined, {
    query: async (sql) => sql.includes('SELECT 1')
      ? { rowCount: 1, rows: [{}] } : { rowCount: 0, rows: [] },
  });
  assert.equal(res.code, 404);
  assert.equal(JSON.stringify(res.body).includes('+998'), false);
});

test('v88: customer own profile responses are never cacheable', () => {
  const fs = require('node:fs');
  const file = fs.readFileSync(path.join(__dirname, '../controllers/customersController.js'), 'utf8');
  assert.match(file, /async function getMyProfile\(req, res\) \{\s*if \(typeof res\.set/);
});

test('v88: booking API only selects customer phone for barber-owned rows', () => {
  const fs = require('node:fs');
  const file = fs.readFileSync(path.join(__dirname, '../controllers/bookingsController.js'), 'utf8');
  const collection = file.split('// Bitta bookingni ID orqali olish')[0];
  const customer = collection.split('req.user.role === "customer"')[1].split('req.user.role === "barber"')[0];
  const barberSql = collection.split('req.user.role === "barber"')[1].split('} else {')[0];
  assert.doesNotMatch(customer, /customer_phone/);
  assert.match(barberSql, /customer_phone/);
  assert.match(barberSql, /WHERE bookings\.barber_id = \$1/);
  assert.match(file, /async function getBooking\(req, res\) \{\s*if \(typeof res\.set/);
  assert.match(file, /async function getBookingById\(req, res\) \{\s*if \(typeof res\.set/);
});
