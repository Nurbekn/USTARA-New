'use strict';
// v207: regression-only tests. No real PostgreSQL connection, writes or .env.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {EMPTY_TABLES, buildSnapshotSql, verifyEmptySnapshot, runEmptyFixtureProof} =
  require('../scripts/v205-empty-fixtures-proof.cjs');
const {POSTRUN_TABLES, buildPostrunSnapshotSql, verifyPostrunSnapshot, runPostrunCleanupProof} =
  require('../scripts/v206-postrun-cleanup-proof.cjs');
const yaml = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/v193-isolated-postgres-booking.yml'), 'utf8');
const env = Object.freeze({
  NODE_ENV: 'test',
  USTARA_BOOKING_CONCURRENCY_TESTS: 'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL: 'postgresql://ustara_account_test:fixture-only@127.0.0.1:5432/ustara_test_db',
});
function snapshot(tables = EMPTY_TABLES) {
  return {database:'ustara_test_db', session_user:'ustara_account_test',
    current_user:'ustara_account_test', schema:'public', read_only:'on',
    ...Object.fromEntries(tables.map(t => [t, false]))};
}
function fakePool(row = snapshot()) {
  const calls = [];
  const client = {
    query:async sql => { calls.push(sql); return sql.startsWith('SELECT') ? {rows:[row]} : {rows:[]}; },
    release:() => calls.push('release'),
  };
  return {pool:{connect:async () => {calls.push('connect');return client;}},calls};
}
test('v207: preflight and postflight inspect the same 14 tables with no duplicate names',()=>{
  assert.equal(EMPTY_TABLES.length,14);
  assert.deepEqual(EMPTY_TABLES,POSTRUN_TABLES);
  assert.equal(new Set(EMPTY_TABLES).size,14);
  assert.ok(Object.isFrozen(EMPTY_TABLES));
  assert.ok(Object.isFrozen(POSTRUN_TABLES));
});
test('v207: preflight now checks idempotency keys and Telegram linking tokens',()=>{
  for(const name of ['booking_request_keys','customer_telegram_link_tokens']){
    assert.ok(EMPTY_TABLES.includes(name));
    assert.match(buildSnapshotSql(),new RegExp(`EXISTS \\(SELECT 1 FROM public\\.${name} LIMIT 1\\)`));
    assert.throws(()=>verifyEmptySnapshot({...snapshot(), [name]:true}),/v205/);
  }
});
test('v207: postflight remains strict for the same 14 table identities',()=>{
  for(const name of EMPTY_TABLES){
    assert.throws(()=>verifyPostrunSnapshot({...snapshot(), [name]:true}),/v206/);
  }
});
test('v207: both proofs accept only a fully empty read-only snapshot',()=>{
  assert.equal(verifyEmptySnapshot(snapshot()).inspectedTables,14);
  assert.equal(verifyPostrunSnapshot(snapshot()).checkedTables,14);
  for(const invalid of [{read_only:'off'},{database:'prod'},{current_user:'postgres'},
    {schema:'other'},{unexpected:false}]){
    assert.throws(()=>verifyEmptySnapshot({...snapshot(),...invalid}),/v205/);
    assert.throws(()=>verifyPostrunSnapshot({...snapshot(),...invalid}),/v206/);
  }
});
test('v207: both proof SQL statements are read-only existence checks',()=>{
  for(const sql of [buildSnapshotSql(),buildPostrunSnapshotSql()]){
    assert.ok(sql.startsWith('SELECT current_database()'));
    assert.equal((sql.match(/EXISTS \(SELECT 1 FROM public\./g) || []).length,14);
    assert.doesNotMatch(sql,/\b(?:DELETE|UPDATE|INSERT|ALTER|DROP|TRUNCATE)\b/i);
    assert.doesNotMatch(sql,/SELECT \*|\b(?:password|chat_id|token_hash)\b/i);
  }
});
test('v207: dirty token fixture rejects preflight and guarantees a rollback',async()=>{
  for(const name of ['booking_request_keys','customer_telegram_link_tokens']){
    const {pool,calls}=fakePool({...snapshot(),[name]:true});
    await assert.rejects(runEmptyFixtureProof(env,pool),/v205/);
    assert.deepEqual(calls.slice(-2),['ROLLBACK','release']);
  }
});
test('v207: clean preflight and postflight both roll back without COMMIT',async()=>{
  for(const run of [runEmptyFixtureProof,runPostrunCleanupProof]){
    const {pool,calls}=fakePool();
    const result=await run(env,pool);
    assert.equal(result.empty,true);
    assert.deepEqual(calls.slice(0,2),['connect','BEGIN READ ONLY']);
    assert.deepEqual(calls.slice(-2),['ROLLBACK','release']);
    assert.ok(!calls.includes('COMMIT'));
  }
});
test('v207: both checks guard target before any DB connection',async()=>{
  let connected=false;
  const pool={connect:async()=>{connected=true;throw new Error('must not connect');}};
  for(const run of [runEmptyFixtureProof,runPostrunCleanupProof]){
    await assert.rejects(run({...env, USTARA_TEST_DATABASE_URL:'postgresql://postgres:x@127.0.0.1/production'},pool),/v193|local/);
  }
  assert.equal(connected,false);
});
test('v207: failed integration still triggers a read-only cleanup proof, skipped/cancelled do not',()=>{
  assert.match(yaml,/- name: Booking overlap and concurrency integration[^\n]*\n\s+id: booking_integration/);
  const post=yaml.slice(yaml.indexOf('- name: Prove test fixture cleanup after integration'),
    yaml.indexOf('- name: Verify artifact schema'));
  assert.match(post,/if: \$\{\{ !cancelled\(\) && \(steps\.booking_integration\.outcome == 'success' \|\| steps\.booking_integration\.outcome == 'failure'\) \}\}/);
  assert.match(post,/node scripts\/v206-postrun-cleanup-proof\.cjs/);
  assert.doesNotMatch(yaml,/continue-on-error:|if:\s*always\(\)/);
});
test('v207: no evidence upload on failing test; workflow remains manual-only',()=>{
  const verify=yaml.indexOf('- name: Verify artifact schema');
  const upload=yaml.indexOf('- name: Upload verified booking integration evidence');
  assert.ok(verify>0 && verify<upload);
  assert.match(yaml.slice(upload),/if: success\(\)/);
  assert.match(yaml,/^on:\s*\n\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yaml,/^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(yaml,/npm run test:v213:unit/);
});
