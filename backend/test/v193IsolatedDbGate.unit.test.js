'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkIsolatedDbGate } = require('../scripts/v193-isolated-db-gate.cjs');

const base = () => ({
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:disposable@127.0.0.1:5432/ustara_test_db',
});

test('v193: exact local CI role, database and explicit opt-in pass without credential leakage', () => {
  const result = checkIsolatedDbGate(base());
  assert.deepEqual(result, {database: 'ustara_test_db', user: 'ustara_account_test', host: '127.0.0.1', port: 5432});
  assert.doesNotMatch(JSON.stringify(result), /disposable/);
});
test('v193: no opt-in, non-test environment, or missing target is rejected', () => {
  for (const key of ['NODE_ENV', 'USTARA_BOOKING_CONCURRENCY_TESTS', 'USTARA_TEST_DATABASE_URL']) {
    const env = base(); delete env[key];
    assert.throws(() => checkIsolatedDbGate(env));
  }
});
test('v193: remote host, admin role, production db, and URL overrides are rejected', () => {
  for (const url of [
    'postgresql://ustara_account_test:disposable@production.example.com:5432/ustara_test_db',
    'postgresql://postgres:disposable@127.0.0.1:5432/ustara_test_db',
    'postgresql://ustara_account_test:disposable@127.0.0.1:5432/ustara_db',
    'postgresql://ustara_account_test:disposable@127.0.0.1:5432/ustara_test_db?host=127.0.0.1',
    'postgresql://ustara_account_test:disposable@127.0.0.1:6543/ustara_test_db',
  ]) assert.throws(() => checkIsolatedDbGate({...base(), USTARA_TEST_DATABASE_URL: url}));
});
test('v193: production DB and Telegram env variables are forbidden', () => {
  for (const key of ['DB_HOST', 'DB_NAME', 'DATABASE_URL', 'TELEGRAM_BOT_TOKEN', 'BOT_TOKEN']) {
    assert.throws(() => checkIsolatedDbGate({...base(), [key]: 'do-not-use'}));
  }
});
test('v193: workflow is manual, read-only GitHub permission, disposable service and limited test target', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
  assert.match(workflow, /^on:\s*\n\s*workflow_dispatch:/m);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /postgres:18-alpine/);
  assert.match(workflow, /CREATE ROLE ustara_account_test LOGIN PASSWORD/);
  assert.match(workflow, /NOSUPERUSER NOCREATEDB NOCREATEROLE/);
  assert.match(workflow, /CREATE DATABASE ustara_test_db OWNER ustara_account_test/);
  assert.match(workflow, /docker cp backend\/database/);
  assert.match(workflow, /bootstrap\.sql/);
  assert.match(workflow, /node scripts\/v208-integration-exit-gate\.cjs/);
  const runner = fs.readFileSync(path.join(__dirname, '../scripts/v208-integration-exit-gate.cjs'), 'utf8');
  assert.match(runner, /test\/bookingConcurrency\.postgres\.integration\.test\.js/);
  assert.match(workflow, /I_AUTHORIZE_TEST_DATA/);
  assert.doesNotMatch(workflow, /\b(push|pull_request|schedule|deployment):|secrets\.|TELEGRAM_BOT_TOKEN|npm publish|DROP DATABASE/i);
});
test('v193: preflight does not open a connection, read environment files, run SQL, or print passwords', () => {
  const src = fs.readFileSync(path.join(__dirname, '../scripts/v193-isolated-db-gate.cjs'), 'utf8');
  assert.doesNotMatch(src, /require\(['"](?:pg|dotenv|child_process)|execSync|spawnSync|query\(|readFileSync|console\.log\([^\n]*password/);
});
