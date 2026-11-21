'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EMPTY_TABLES } = require('../scripts/v205-empty-fixtures-proof.cjs');
const { POSTRUN_TABLES, buildPostrunSnapshotSql, verifyPostrunSnapshot, runPostrunCleanupProof } =
  require('../scripts/v206-postrun-cleanup-proof.cjs');
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
  ...Object.fromEntries(POSTRUN_TABLES.map(table => [table, false])),
});
function mockPool(snapshot = clean(), {selectError, rowCount} = {}) {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT')) {
        if (selectError) throw selectError;
        return { rows: rowCount === 0 ? [] : rowCount === 2 ? [snapshot, snapshot] : [snapshot] };
      }
      return {rows: []};
    },
    release() {calls.push('release');},
  };
  return { pool: {connect: async () => {calls.push('connect'); return client;}}, calls };
}

test('v206: checks all v205 tables and additional booking-related cascade rows', () => {
  assert.equal(POSTRUN_TABLES.length, EMPTY_TABLES.length);
  assert.ok(Object.isFrozen(POSTRUN_TABLES));
  assert.deepEqual(POSTRUN_TABLES, EMPTY_TABLES);
  assert.ok(POSTRUN_TABLES.includes('booking_request_keys'));
  assert.ok(POSTRUN_TABLES.includes('customer_telegram_link_tokens'));
  assert.equal(new Set(POSTRUN_TABLES).size, POSTRUN_TABLES.length);
  assert.ok(!POSTRUN_TABLES.includes('admin_accounts'));
});

test('v206: query only checks existence; no data exfiltration or mutation', () => {
  const sql = buildPostrunSnapshotSql();
  assert.match(sql, /^SELECT current_database\(\)/);
  assert.match(sql, /transaction_read_only/);
  for (const table of POSTRUN_TABLES) {
    assert.ok(sql.includes(`EXISTS (SELECT 1 FROM public.${table} LIMIT 1) AS ${table}`), table);
  }
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\b/i);
  assert.doesNotMatch(sql, /SELECT \*|password|phone|chat_id/i);
});

test('v206: fresh postrun state passes with minimal non-sensitive proof', () => {
  assert.deepEqual(verifyPostrunSnapshot(clean()), {
    database: 'ustara_test_db', checkedTables: 14, empty: true, readOnly: true,
  });
});

test('v206: any leftover fixture including idempotency keys fails closed', () => {
  for (const table of POSTRUN_TABLES) {
    assert.throws(() => verifyPostrunSnapshot({...clean(), [table]: true}), /v206/, table);
  }
});

test('v206: reject a changed DB, role, schema, or transaction mode', () => {
  for (const patch of [
    {database: 'production'}, {session_user: 'postgres'},
    {current_user: 'postgres'}, {schema: 'not_public'}, {read_only: 'off'},
  ]) assert.throws(() => verifyPostrunSnapshot({...clean(), ...patch}), /v206/);
});

test('v206: reject missing, excess, malformed and ambiguous fields', () => {
  const {bookings, ...missing} = clean();
  for (const value of [null, [], {}, missing, {...clean(), unexpected: false},
    {...clean(), users: 0}, {...clean(), booking_request_keys: 'false'}]) {
    assert.throws(() => verifyPostrunSnapshot(value), /v206/);
  }
});

test('v206: invalid authorization must fail before pool.connect', async () => {
  let connections = 0;
  const pool = {connect: async () => {connections++; throw Error('MUST_NOT_CONNECT');}};
  for (const patch of [
    {NODE_ENV: 'production'}, {USTARA_BOOKING_CONCURRENCY_TESTS: ''},
    {DATABASE_URL: 'postgresql://production.invalid/main'},
    {TELEGRAM_BOT_TOKEN: 'unsafe'},
    {USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:pw@8.8.8.8/ustara_test_db'},
  ]) await assert.rejects(runPostrunCleanupProof({...env, ...patch}, pool), /v193|local/);
  assert.equal(connections, 0);
});

test('v206: read-only postflight rolls back and releases connection', async () => {
  const {pool, calls} = mockPool();
  const proof = await runPostrunCleanupProof(env, pool);
  assert.equal(proof.checkedTables, 14);
  assert.equal(calls[0], 'connect');
  assert.equal(calls[1], 'BEGIN READ ONLY');
  assert.equal(calls[2].startsWith('SELECT'), true);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
  assert.equal(calls.filter(call => call === 'ROLLBACK').length, 1);
  assert.ok(!calls.includes('COMMIT'));
});

test('v206: a leftover idempotency record blocks postflight and rolls back', async () => {
  const {pool, calls} = mockPool({...clean(), booking_request_keys: true});
  await assert.rejects(runPostrunCleanupProof(env, pool), /v206/);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});

test('v206: SQL errors and ambiguous rows fail closed, releasing connection', async () => {
  for (const options of [{selectError: new Error('test table unavailable')}, {rowCount: 0}, {rowCount: 2}]) {
    const {pool, calls} = mockPool(clean(), options);
    await assert.rejects(runPostrunCleanupProof(env, pool), /test table unavailable|v206/);
    assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
  }
});

test('v206: CI verifies postrun cleanup after full concurrency and before artifact verification', () => {
  const yaml = fs.readFileSync(path.join(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
  const pre = yaml.indexOf('- name: Require fresh and empty account/booking fixtures');
  const testStep = yaml.indexOf('- name: Booking overlap and concurrency integration');
  const post = yaml.indexOf('- name: Prove test fixture cleanup after integration');
  const verify = yaml.indexOf('- name: Verify artifact schema and bind evidence to this CI attempt');
  const upload = yaml.indexOf('- name: Upload verified booking integration evidence');
  assert.ok(pre >= 0 && pre < testStep && testStep < post && post < verify && verify < upload);
  assert.match(yaml, /node scripts\/v206-postrun-cleanup-proof\.cjs/);
  assert.match(yaml, /npm run test:v213:unit/);
  assert.doesNotMatch(yaml, /continue-on-error:|if:\s*always\(\)/);
  assert.match(yaml, /^on:\s*\n\s*workflow_dispatch:\s*$/m);
});
