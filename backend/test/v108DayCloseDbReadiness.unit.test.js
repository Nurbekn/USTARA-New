'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateEnv,verifySchema,verifyAdvisorySerialization,run}=require('../scripts/v108-day-close-db-check');
const URL='postgres://ustara_account_test:local@127.0.0.1:5432/ustara_test_db';
const environment={NODE_ENV:'test',USTARA_V108_DAY_CLOSE_READINESS:'I_AUTHORIZE_READ_ONLY_TEST',USTARA_TEST_DATABASE_URL:URL};
const target=()=>validateEnv(environment);
test('v108: no authorization, no database connection',()=>{
 assert.throws(()=>validateEnv({...environment,USTARA_V108_DAY_CLOSE_READINESS:''}),/authorization/);
 assert.throws(()=>validateEnv({...environment,NODE_ENV:'production'}),/authorization/);
 assert.throws(()=>validateEnv({...environment,NODE_ENV:'development'}),/authorization/);
});
for(const url of ['postgres://ustara_account_test@db.example/ustara_test_db',
 'postgres://ustara_account_test@127.0.0.1:5433/ustara_test_db',
 'postgres://postgres@127.0.0.1:5432/ustara_test_db',
 'postgres://ustara_account_test@127.0.0.1:5432/production',
 'postgres://ustara_account_test@localhost:5432/ustara_test_db',
 'postgres://ustara_account_test@127.0.0.1:5432/ustara_test_db?options=-c%20search_path%3Dpublic'])
 test('v108: disallowed connection target rejected before opening pool',()=>{
  assert.throws(()=>validateEnv({...environment,USTARA_TEST_DATABASE_URL:url}));
 });
test('v108: exact local role, host and test DB are accepted',()=>{
 const t=target();assert.equal(t.host,'127.0.0.1');assert.equal(t.port,5432);
 assert.equal(t.database,'ustara_test_db');assert.equal(t.sessionUser,'ustara_account_test');
});
test('v108: concurrent advisory lock blocks competing writer, and rollback releases it',async()=>{
 const state={locked:false};const mk=()=>({async query(sql){
  if(sql==='ROLLBACK'){state.locked=false;return {rows:[],rowCount:0};}
  if(sql.includes('pg_try_advisory_xact_lock')){const got=!state.locked;if(got)state.locked=true;return {rows:[{acquired:got}],rowCount:1};}
  throw Error('unexpected sql');
 }});
 const actual=await verifyAdvisorySerialization(mk(),mk());
 assert.equal(actual.sameKeyBlocksConcurrentWriters,true);
 assert.equal(actual.rollbackReleasesLock,true);
});
test('v108: advisory lock failure is fail-closed',async()=>{
 const first={query:async()=>({rows:[{acquired:true}]})};
 const second={query:async()=>({rows:[{acquired:true}]})};
 await assert.rejects(verifyAdvisorySerialization(first,second),/escaped advisory lock/);
});
test('v108: readiness does not claim PASS when schema contract is incomplete',async()=>{
 const c={query:async sql=>{
  if(sql.includes('SELECT current_database()'))return {rows:[{database:'ustara_test_db',session_user:'ustara_account_test',current_user:'ustara_account_test',is_superuser:false}]};
  if(sql.includes('FROM ustara_schema_migrations'))return {rows:[]};
  return {rows:[]};
 }};
 await assert.rejects(verifySchema(c,target()));
});
test('v108: absent DB never silently counts as PASS',async()=>{
 let connected=0,ended=0;
 const result=run(environment,class {constructor(){this.connect=async()=>{connected++;throw Error('local postgres unavailable');};this.end=async()=>{ended++;};}});
 await assert.rejects(result,/local postgres unavailable/);
 assert.equal(connected,1);assert.equal(ended,1);
});
