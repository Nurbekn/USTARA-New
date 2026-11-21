'use strict';
// Offline-only regression tests. No PostgreSQL service, writes or network.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {checkPrebootstrapCiIdentity} = require('../scripts/v218-prebootstrap-ci-gate.cjs');
const {runPrebootstrapRuntimeProof} = require('../scripts/v218-prebootstrap-runtime-proof.cjs');

const ci = Object.freeze({
  GITHUB_ACTIONS: 'true', GITHUB_RUN_ID: '218000', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'Nurbekn/USTARA-New',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_WORKFLOW_REF: 'Nurbekn/USTARA-New/.github/workflows/v193-isolated-postgres-booking.yml@refs/heads/main',
});
const db = Object.freeze({
  NODE_ENV: 'test', USTARA_BOOKING_CONCURRENCY_TESTS:'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:offline@127.0.0.1:5432/ustara_test_db',
});
function snapshot() {return {
  database:'ustara_test_db', session_user:'ustara_account_test', current_user:'ustara_account_test',
  database_owner:'ustara_account_test',server_version_num:180001,is_superuser:false,
  can_create_db:false,can_create_role:false,can_replicate:false,can_bypass_rls:false,
  can_login:true,in_recovery:false,read_only:'on',btree_gist_public:true,server_addr:'172.18.0.2',
};}
function injectedPool(row=snapshot()) {
  const queries = [];
  const client = {
    query:async sql=>{queries.push(sql); return sql.trimStart().startsWith('SELECT')?{rows:[row]}:{rows:[]};},
    release:()=>queries.push('release'),
  };
  return {queries, connect:async()=>client};
}

test('v218: a complete manual GitHub Actions identity passes without exposing fields',()=>{
  assert.deepEqual(checkPrebootstrapCiIdentity(ci), {mode:'github-actions',checked:true});
});
test('v218: absent GitHub Actions identity cannot set up disposable DB',()=>{
  assert.throws(()=>checkPrebootstrapCiIdentity({}),/v218/);
});
test('v218: partial or spoofed GitHub Actions contexts are denied early',()=>{
  for(const changed of [
    {GITHUB_ACTIONS:'false'}, {GITHUB_RUN_ID:''}, {GITHUB_RUN_ATTEMPT:'0'},
    {GITHUB_SHA:'0'.repeat(40)}, {GITHUB_REPOSITORY:'other/repo'},
    {GITHUB_EVENT_NAME:'push'}, {GITHUB_WORKFLOW_REF:'untrusted'},
  ]) assert.throws(()=>checkPrebootstrapCiIdentity({...ci,...changed}));
});
test('v218: a valid PostgreSQL 18 runtime can be checked read-only before bootstrap',async()=>{
  const pool=injectedPool();
  const result=await runPrebootstrapRuntimeProof({...ci,...db},pool);
  assert.equal(result.version,18);
  assert.equal(result.readOnly,true);
  assert.equal(pool.queries[0],'BEGIN READ ONLY');
  assert.match(pool.queries[1],/server_version_num/);
  assert.equal(pool.queries[2],'ROLLBACK');
  assert.equal(pool.queries[3],'release');
});
test('v218: wrong PostgreSQL major version is rejected before bootstrap',async()=>{
  const pool=injectedPool({...snapshot(),server_version_num:170000});
  await assert.rejects(runPrebootstrapRuntimeProof({...ci,...db},pool),/v198/);
  assert.deepEqual(pool.queries.filter(x=>x==='ROLLBACK'),['ROLLBACK']);
});
test('v218: elevated role or wrong database owner is rejected before bootstrap',async()=>{
  for(const bad of [{is_superuser:true},{database_owner:'postgres'},{btree_gist_public:false}]) {
    const pool=injectedPool({...snapshot(),...bad});
    await assert.rejects(runPrebootstrapRuntimeProof({...ci,...db},pool),/v198/);
  }
});
test('v218: CI metadata failure prevents DB connection entirely',async()=>{
  let connected=false;
  await assert.rejects(runPrebootstrapRuntimeProof({...db,...ci,GITHUB_RUN_ATTEMPT:'bad'},
    {connect:async()=>{connected=true;}}));
  assert.equal(connected,false);
});
test('v218: unsafe database URL prevents DB connection entirely',async()=>{
  let connected=false;
  await assert.rejects(runPrebootstrapRuntimeProof({...db,...ci,
    USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:offline@db.example.com/ustara_test_db'},
    {connect:async()=>{connected=true;}}),/v193|local host/i);
  assert.equal(connected,false);
});
test('v218: CI checks identity before creating test role and runtime before migrations',()=>{
  const file=fs.readFileSync(path.resolve(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  const index=x=>file.indexOf(x);
  for(const needle of [
    'npm run test:v218:unit', 'node backend/scripts/v219-preinstall-ci-gate.cjs',
    'Create disposable non-superuser DB', 'node scripts/v218-prebootstrap-runtime-proof.cjs',
    'Bootstrap ONLY the disposable CI database', 'node scripts/v194-bootstrap-proof.cjs',
    'node scripts/v198-postgres-runtime-proof.cjs', 'node scripts/v208-integration-exit-gate.cjs',
  ]) assert.notEqual(index(needle),-1,needle);
  assert.ok(index('node backend/scripts/v219-preinstall-ci-gate.cjs')<index('Create disposable non-superuser DB'));
  assert.ok(index('Create disposable non-superuser DB')<index('node scripts/v218-prebootstrap-runtime-proof.cjs'));
  assert.ok(index('node scripts/v218-prebootstrap-runtime-proof.cjs')<index('Bootstrap ONLY the disposable CI database'));
  assert.ok(index('Bootstrap ONLY the disposable CI database')<index('node scripts/v194-bootstrap-proof.cjs'));
  assert.ok(index('node scripts/v194-bootstrap-proof.cjs')<index('node scripts/v198-postgres-runtime-proof.cjs'));
  assert.match(file,/^on:\s*\n\s*workflow_dispatch:/m);
  assert.doesNotMatch(file,/\b(push|pull_request|schedule):/);
  assert.match(file,/if: success\(\)\s*\n\s*uses: actions\/upload-artifact@v4/);
});
