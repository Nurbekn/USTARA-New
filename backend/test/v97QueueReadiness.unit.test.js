'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateEnv,verifyQueueReadiness}=require('../scripts/v97-queue-readiness');
const env={NODE_ENV:'test',USTARA_V97_QUEUE_READINESS:'I_AUTHORIZE_READ_ONLY_TEST',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:test-password@127.0.0.1:5432/ustara_test_db'};
const target=validateEnv(env);
for(const changes of [
 {NODE_ENV:'production'},
 {USTARA_V97_QUEUE_READINESS:'yes'},
 {USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:p@prod.example:5432/ustara_test_db'},
 {USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:p@127.0.0.1:5432/ustara_production'},
 {USTARA_TEST_DATABASE_URL:'postgres://postgres:p@127.0.0.1:5432/ustara_test_db'},
 {USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:p@127.0.0.1:5433/ustara_test_db'},
])test('v97 preflight rejects unsafe config '+JSON.stringify(changes),()=>{
 assert.throws(()=>validateEnv({...env,...changes}));
});
function fakeClient({fields={},migrations=63}={}){
 const calls=[];
 const client={async query(sql){
  calls.push(sql);
  if(sql.includes('session_user,')||sql.includes('session_user,'))return {rows:[{database:'ustara_test_db',
   session_user:'ustara_account_test',current_user:'ustara_account_test',is_superuser:false}]};
  if(sql.includes('SELECT version FROM ustara_schema_migrations')){
   // Match the repository's bootstrap migration plan exactly.
   const {expectedMigrationVersions}=require('../scripts/v40-staging');
   return {rows:expectedMigrationVersions().slice(0,migrations).sort().map(version=>({version}))};
  }
  if(sql.includes('right_schema'))return {rows:[{right_schema:true,read_only:true,
   arrival_column:true,started_column:true,state_check:true,audit_check:true,
   one_active_index:true,...fields}]};
  throw Error('Unexpected test SQL '+sql);
 }};
 return {client,calls};
}
test('v97 read-only schema check verifies all 63 migrations and queue constraints',async()=>{
 const {client,calls}=fakeClient();const data=await verifyQueueReadiness(client,target);
 assert.equal(data.status,'PASS');assert.equal(data.migrations,63);
 assert.equal(calls.length,3);
 assert.ok(calls.some(sql=>sql.includes('transaction_read_only')));
 assert.ok(calls.every(sql=>!/\b(?:UPDATE|INSERT|DELETE|DROP|ALTER)\b\s+\w+/i.test(sql)));
});
for(const field of ['right_schema','read_only','arrival_column','started_column','state_check','audit_check','one_active_index']){
 test('v97 missing '+field+' fails closed',async()=>{
  const {client}=fakeClient({fields:{[field]:false}});
  await assert.rejects(verifyQueueReadiness(client,target),/NOT PASS/);
 });
}
test('v97 missing forward migration fails closed',async()=>{
 const {client}=fakeClient({migrations:43});
 await assert.rejects(verifyQueueReadiness(client,target),/ledger|49/);
});
test('v97 empty db target and unauthenticated requests never connect',()=>{
 assert.throws(()=>validateEnv({...env,USTARA_TEST_DATABASE_URL:''}));
 assert.throws(()=>validateEnv({USTARA_TEST_DATABASE_URL:env.USTARA_TEST_DATABASE_URL}));
});
