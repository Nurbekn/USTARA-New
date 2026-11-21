'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {isPrivateServerAddress, verifyRuntimeSnapshot, runRuntimeProof} =
  require('../scripts/v198-postgres-runtime-proof.cjs');

const env = Object.freeze({
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:fixture-only@127.0.0.1:5432/ustara_test_db',
});
function snapshot(server_addr = '172.18.0.2') {
  return {
    database: 'ustara_test_db', session_user: 'ustara_account_test',
    current_user: 'ustara_account_test', database_owner: 'ustara_account_test',
    server_version_num: 180004, is_superuser: false, can_create_db: false,
    can_create_role: false, can_replicate: false, can_bypass_rls: false,
    can_login: true, in_recovery: false, read_only: 'on',
    btree_gist_public: true, server_addr,
  };
}

test('v204: accepts Docker bridge address behind a client loopback URL', () => {
  assert.equal(verifyRuntimeSnapshot(snapshot('172.18.0.2')).readOnly, true);
  assert.equal(verifyRuntimeSnapshot(snapshot('172.31.255.254')).version, 18);
});
test('v204: accepts private IPv4 bridge ranges without pinning their subnet', () => {
  for (const address of ['10.0.42.5', '192.168.240.2', '172.16.1.1', '127.0.0.1']) {
    assert.equal(isPrivateServerAddress(address), true, address);
  }
});
test('v204: supports local and private IPv6 transport', () => {
  for (const address of ['::1', 'fd00::2', 'fc00::12', 'fe80::1']) {
    assert.equal(isPrivateServerAddress(address), true, address);
  }
});
test('v204: rejects external public addresses and invalid or wildcard endpoints', () => {
  for (const address of ['8.8.8.8', '172.32.0.1', '192.169.1.1',
    '0.0.0.0', '::', '2001:4860:4860::8888', '', '127.0.0.0', null, undefined, 'localhost']) {
    assert.equal(isPrivateServerAddress(address), false, String(address));
    assert.throws(() => verifyRuntimeSnapshot({...snapshot(), server_addr: address}), /v198/);
  }
});
test('v204: Docker address does not override database role and read-only checks', () => {
  assert.throws(() => verifyRuntimeSnapshot({...snapshot(), is_superuser: true}), /v198/);
  assert.throws(() => verifyRuntimeSnapshot({...snapshot(), read_only: 'off'}), /v198/);
  assert.throws(() => verifyRuntimeSnapshot({...snapshot(), database: 'production'}), /v198/);
});
test('v204: read-only catalog proof accepts Docker bridge but still rolls back', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      return sql.trimStart().startsWith('SELECT') ? {rows: [snapshot()]} : {rows: []};
    },
    release() { calls.push('release'); },
  };
  const result = await runRuntimeProof(env, {connect: async () => client});
  assert.deepEqual(result, {version: 18, database: 'ustara_test_db',
    role: 'ustara_account_test', readOnly: true});
  assert.equal(calls[0], 'BEGIN READ ONLY');
  assert.equal(calls.at(-2), 'ROLLBACK');
  assert.equal(calls.at(-1), 'release');
});
test('v204: a remote client URL is rejected before any DB connection', async () => {
  let attempts = 0;
  await assert.rejects(runRuntimeProof({...env,
    USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:fixture-only@192.168.1.2:5432/ustara_test_db'
  }, {connect: async () => {attempts += 1;}}), /v193|loopback/);
  assert.equal(attempts, 0);
});
