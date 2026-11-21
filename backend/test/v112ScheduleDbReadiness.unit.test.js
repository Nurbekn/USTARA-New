'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateEnv,verifyReadSnapshot,run}=require('../scripts/v112-schedule-db-check');
const env={NODE_ENV:'test',USTARA_V112_SCHEDULE_DB_READINESS:'I_AUTHORIZE_READ_ONLY_TEST',
 USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:test@127.0.0.1:5432/ustara_test_db'};
test('v112: only explicit authorization and local test DB are allowed',()=>{
 const target=validateEnv(env);assert.equal(target.host,'127.0.0.1');
 assert.equal(target.database,'ustara_test_db');assert.equal(target.sessionUser,'ustara_account_test');
 for(const input of [{...env,NODE_ENV:'production'}, {...env,USTARA_V112_SCHEDULE_DB_READINESS:''},
  {...env,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:test@evil.example:5432/ustara_test_db'},
  {...env,USTARA_TEST_DATABASE_URL:'postgres://postgres:test@127.0.0.1:5432/ustara_test_db'},
  {...env,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:test@127.0.0.1:5432/ustara_live_db'},
  {...env,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:test@127.0.0.1:5433/ustara_test_db'},
  {...env,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:test@localhost:5432/ustara_test_db'},
  {...env,USTARA_TEST_DATABASE_URL:undefined}])assert.throws(()=>validateEnv(input));
});
test('v112: rejection occurs before constructing any database pool',async()=>{
 let constructed=0;
 class Pool{constructor(){constructed++;}}
 await assert.rejects(run({...env,NODE_ENV:'production'},Pool),/authorization/);
 assert.equal(constructed,0);
});
test('v112: missing local PostgreSQL cannot accidentally be reported PASS',async()=>{
 let closed=0;
 class Pool{async connect(){throw Error('local postgres not available');}async end(){closed++;}}
 await assert.rejects(run(env,Pool),/not available/);assert.equal(closed,1);
});
test('v112: schema check rejects a non-read-only or non-repeatable snapshot',async()=>{
 const target=validateEnv(env);
 for(const changes of [{read_only:false},{repeatable_read:false},{schema_ok:false}]){
  const client={query:async sql=>{
   if(sql.includes('SELECT current_database()'))return {rowCount:1,rows:[{database:'ustara_test_db',session_user:'ustara_account_test',current_user:'ustara_account_test',is_superuser:false}]};
   if(sql.includes('transaction_isolation'))return {rowCount:1,rows:[{schema_ok:true,read_only:true,repeatable_read:true,snapshot_time:'2035-01-01T00:00:00.000Z',...changes}]};
   throw Error('should not continue');
  }};
  await assert.rejects(verifyReadSnapshot(client,target),/read-only repeatable-read snapshot/);
 }
});
test('v112: schema check rejects an incomplete or uninitialized migration ledger',async()=>{
 const target=validateEnv(env);
 const client={query:async sql=>{
  if(sql.includes('SELECT current_database()'))return {rowCount:1,rows:[{database:'ustara_test_db',session_user:'ustara_account_test',current_user:'ustara_account_test',is_superuser:false}]};
  if(sql.includes('transaction_isolation'))return {rowCount:1,rows:[{schema_ok:true,read_only:true,repeatable_read:true,snapshot_time:'2035-01-01T00:00:00.000Z'}]};
  if(sql.includes('FROM ustara_schema_migrations'))return {rowCount:0,rows:[]};
  throw Error('should not continue');
 }};
 await assert.rejects(verifyReadSnapshot(client,target),/63 checked-in forward migrations/);
});
test('v112: pool explicitly sets read-only default and never uses production URL',async()=>{
 let options,closed=0;
 class Pool{constructor(o){options=o;}async connect(){throw Error('no test DB');}async end(){closed++;}}
 await assert.rejects(run(env,Pool),/no test DB/);
 assert.equal(options.max,2);assert.equal(options.ssl,false);
 assert.match(options.options,/default_transaction_read_only=on/);
 assert.equal(options.connectionString,env.USTARA_TEST_DATABASE_URL);assert.equal(closed,1);
});
