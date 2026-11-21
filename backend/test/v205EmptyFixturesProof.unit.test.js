'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EMPTY_TABLES, buildSnapshotSql, verifyEmptySnapshot, runEmptyFixtureProof } =
  require('../scripts/v205-empty-fixtures-proof.cjs');

const env = Object.freeze({
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:disposable-only@127.0.0.1:5432/ustara_test_db',
});
const clean = () => ({
  database: 'ustara_test_db',
  session_user: 'ustara_account_test',
  current_user: 'ustara_account_test',
  schema: 'public',
  read_only: 'on',
  ...Object.fromEntries(EMPTY_TABLES.map(name => [name, false])),
});
function poolFor(snapshot = clean(), { queryError = null } = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT')) {
        if (queryError) throw queryError;
        return { rows: [snapshot] };
      }
      return { rows: [] };
    },
    release() { calls.push('release'); },
  };
  return { pool: { connect: async () => { calls.push('connect'); return client; } }, calls };
}

test('v205: fixed table allowlist inspects account, booking and notification data only', () => {
  assert.equal(EMPTY_TABLES.length, 14);
  assert.equal(new Set(EMPTY_TABLES).size, EMPTY_TABLES.length);
  for (const required of ['users', 'customers', 'barbers', 'bookings', 'services',
    'booking_checkins', 'customer_booking_telegram_outbox']) {
    assert.ok(EMPTY_TABLES.includes(required), required);
  }
  assert.ok(!EMPTY_TABLES.includes('admin_accounts'), 'the bootstrap intentionally seeds an admin row');
  assert.ok(Object.isFrozen(EMPTY_TABLES));
});

test('v205: SQL only checks existence; never reads payloads or changes a table', () => {
  const sql = buildSnapshotSql();
  assert.match(sql, /^SELECT current_database\(\)/);
  assert.match(sql, /current_setting\('transaction_read_only'\)/);
  for (const table of EMPTY_TABLES) {
    assert.ok(sql.includes(`EXISTS (SELECT 1 FROM public.${table} LIMIT 1) AS ${table}`));
  }
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
  assert.doesNotMatch(sql, /SELECT \*|\b(?:password|phone|chat_id|token_hash|token_value)\b/i);
});

test('v205: accepts exactly the empty, read-only, isolated snapshot', () => {
  assert.deepEqual(verifyEmptySnapshot(clean()), {
    database: 'ustara_test_db', inspectedTables: 14, empty: true, readOnly: true,
  });
});

test('v205: each nonempty account, booking or notification table blocks fixture writes', () => {
  for (const table of EMPTY_TABLES) {
    assert.throws(() => verifyEmptySnapshot({ ...clean(), [table]: true }), /v205/, table);
  }
});

test('v205: rejects an unexpected database identity or search path', () => {
  for (const patch of [
    { database: 'production' }, {session_user: 'postgres'},
    {current_user: 'postgres'}, {schema: 'private'}, {read_only: 'off'},
  ]) {
    assert.throws(() => verifyEmptySnapshot({ ...clean(), ...patch }), /v205/);
  }
});

test('v205: rejects missing, extra, malformed or not-boolean fields', () => {
  const {users, ...withoutUsers} = clean();
  for (const value of [null, undefined, [], {}, withoutUsers,
    {...clean(), extra: false}, {...clean(), bookings: 0}, {...clean(), users: 'false'}]) {
    assert.throws(() => verifyEmptySnapshot(value), /v205/);
  }
});

test('v205: v193 authorization gate fails before opening a test database connection', async () => {
  let touched = false;
  const pool = { connect: async () => { touched = true; throw Error('must not connect'); } };
  for (const patch of [
    {NODE_ENV: 'production'},
    {USTARA_BOOKING_CONCURRENCY_TESTS: ''},
    {DATABASE_URL: 'postgres://production.example.invalid/db'},
    {TELEGRAM_BOT_TOKEN: 'unsafe'},
  ]) {
    await assert.rejects(runEmptyFixtureProof({...env, ...patch}, pool), /v193/);
  }
  assert.equal(touched, false);
});

test('v205: rejects remote targets and wrong test role before any connection', async () => {
  let touched = false;
  const pool = { connect: async () => { touched = true; } };
  for (const url of [
    'postgresql://ustara_account_test:x@8.8.8.8:5432/ustara_test_db',
    'postgresql://postgres:x@127.0.0.1:5432/ustara_test_db',
    'postgresql://ustara_account_test:x@127.0.0.1:5432/production',
  ]) {
    await assert.rejects(runEmptyFixtureProof({...env, USTARA_TEST_DATABASE_URL: url}, pool), /v193|host|database/);
  }
  assert.equal(touched, false);
});

test('v205: read-only transaction completes with rollback and resource release', async () => {
  const {pool, calls} = poolFor();
  const proof = await runEmptyFixtureProof(env, pool);
  assert.equal(proof.empty, true);
  assert.deepEqual([calls[0],calls[1],calls.at(-2),calls.at(-1)],
    ['connect','BEGIN READ ONLY','ROLLBACK','release']);
  assert.equal(calls.filter(sql => sql.startsWith('SELECT')).length, 1);
  assert.equal(calls.filter(sql => sql === 'ROLLBACK').length, 1);
});

test('v205: nonempty snapshot rolls back rather than touching data', async () => {
  const {pool, calls} = poolFor({...clean(), bookings: true});
  await assert.rejects(runEmptyFixtureProof(env, pool), /v205/);
  assert.equal(calls.at(-2), 'ROLLBACK');
  assert.equal(calls.at(-1), 'release');
  assert.ok(!calls.includes('COMMIT'));
});

test('v205: SQL failure rolls back and closes the client', async () => {
  const {pool, calls} = poolFor(clean(), {queryError: new Error('missing table')});
  await assert.rejects(runEmptyFixtureProof(env, pool), /missing table/);
  assert.equal(calls.at(-2), 'ROLLBACK');
  assert.equal(calls.at(-1), 'release');
});

test('v205: optional CI job runs preflight after bootstrap and before concurrency test', () => {
  const yaml = fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
  const bootstrap = yaml.indexOf('- name: Bootstrap ONLY the disposable CI database');
  const permission = yaml.indexOf('- name: Verify PostgreSQL 18 runtime identity');
  const fresh = yaml.indexOf('- name: Require fresh and empty account/booking fixtures');
  const concurrency = yaml.indexOf('- name: Booking overlap and concurrency integration');
  assert.ok(bootstrap >= 0 && bootstrap < permission && permission < fresh && fresh < concurrency);
  assert.match(yaml,/node scripts\/v205-empty-fixtures-proof\.cjs/);
  assert.match(yaml,/npm run test:v213:unit/);
  assert.match(yaml,/^on:\s*\n\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yaml,/^\s{2}push:|^\s{2}schedule:|^\s{2}pull_request:/m);
});
