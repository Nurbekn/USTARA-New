'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {verifyRuntimeSnapshot,runRuntimeProof} = require('../scripts/v198-postgres-runtime-proof.cjs');
const env = {
  NODE_ENV:'test', USTARA_BOOKING_CONCURRENCY_TESTS:'I_AUTHORIZE_TEST_DATA',
  USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:disposable@127.0.0.1:5432/ustara_test_db',
};
const good = () => ({
  database:'ustara_test_db', session_user:'ustara_account_test', current_user:'ustara_account_test',
  database_owner:'ustara_account_test',server_version_num:180001,is_superuser:false,
  can_create_db:false,can_create_role:false,can_replicate:false,can_bypass_rls:false,
  can_login:true,in_recovery:false,read_only:'on',btree_gist_public:true,server_addr:'127.0.0.1',
});
test('v198: exact disposable PostgreSQL 18 runtime passes',()=>{
  assert.equal(verifyRuntimeSnapshot(good()).version,18);
});
test('v198: fail closed on wrong version, role, owner, privileges, server and read-only state',()=>{
  for (const [field,value] of Object.entries({
    database:'production',session_user:'postgres',current_user:'postgres',database_owner:'postgres',
    server_version_num:170000,is_superuser:true,can_create_db:true,can_create_role:true,
    can_replicate:true,can_bypass_rls:true,can_login:false,in_recovery:true,
    read_only:'off',btree_gist_public:false,server_addr:'8.8.8.8',
  })) assert.throws(()=>verifyRuntimeSnapshot({...good(),[field]:value}),/v198/,field);
  assert.throws(()=>verifyRuntimeSnapshot({...good(),server_version_num:190000}),/v198/);
  assert.throws(()=>verifyRuntimeSnapshot(null),/v198/);
});
test('v198: reads catalog only, always rolls back and closes owned connections',async()=>{
  const calls=[];
  const client={query:async sql=>{calls.push(sql);return sql.trimStart().startsWith('SELECT')?{rows:[good()]}:{rows:[]};},release:()=>calls.push('release')};
  const pool={connect:async()=>client,end:async()=>calls.push('end')};
  const result=await runRuntimeProof(env,pool);
  assert.equal(result.readOnly,true);
  assert.equal(calls[0],'BEGIN READ ONLY');
  assert.match(calls[1],/pg_catalog\.pg_roles/);
  assert.equal(calls[2],'ROLLBACK');
  assert.equal(calls[3],'release');
  assert.equal(calls.includes('end'),false);
});
test('v198: rejects unsafe env before connecting',async()=>{
  let connected=false;
  await assert.rejects(runRuntimeProof({...env,NODE_ENV:'production'}, {connect:async()=>{connected=true;}}),/v193/);
  assert.equal(connected,false);
});
test('v198: error still rolls back read-only transaction',async()=>{
  const calls=[];
  const pool={connect:async()=>({query:async sql=>{calls.push(sql);if(sql.trimStart().startsWith('SELECT'))throw Error('offline query failed');},release:()=>calls.push('release')})};
  await assert.rejects(runRuntimeProof(env,pool),/offline query failed/);
  assert.deepEqual(calls.filter(x=>x==='ROLLBACK'),['ROLLBACK']);
  assert.equal(calls.at(-1),'release');
});
test('v198: workflow runs runtime gate before write integration and retains manual trigger',()=>{
  const yaml=fs.readFileSync(path.join(__dirname,'../../.github/workflows/v193-isolated-postgres-booking.yml'),'utf8');
  assert.match(yaml,/workflow_dispatch:/);
  assert.ok(yaml.indexOf('node scripts/v198-postgres-runtime-proof.cjs')<yaml.indexOf('node scripts/v208-integration-exit-gate.cjs'));
  assert.ok(yaml.indexOf('node scripts/v194-bootstrap-proof.cjs')<yaml.indexOf('node scripts/v198-postgres-runtime-proof.cjs'));
  assert.match(yaml,/npm run test:v213:unit/);
});
