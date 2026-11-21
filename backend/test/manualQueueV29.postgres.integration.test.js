'use strict';
// v29 staging audit: opt in explicitly, read only, dedicated local test database.
// No DDL/DML and no Telegram traffic. This is NOT a concurrency test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_MANUAL_DB_AUDIT==='I_AUTHORIZE_READ_ONLY_TEST' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);
test('v29 staging manual consent columns, indexes and migration are present',
 {skip:!enabled,timeout:30000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA manual queue staging',['ustara_account_test']);
 // Do not load pg at all when the staging database has not been explicitly authorized.
 const {Pool}=require('pg');
 const db=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
  ssl:false,max:1,application_name:'ustara_manual_queue_read_only_audit',
  connectionTimeoutMillis:5000,statement_timeout:12000,
  options:'-c search_path=public -c default_transaction_read_only=on'});
 let c;
 try{
  c=await db.connect();await assertTestConnection(c,target,'ustara_account_test');
  const identity=await c.query("SELECT current_schema() AS schema,current_setting('transaction_read_only') AS read_only");
  assert.deepEqual(identity.rows[0],{schema:'public',read_only:'on'});
  const migrated=await c.query("SELECT 1 FROM ustara_schema_migrations WHERE version='20261210_manual_queue_claims'");
  assert.equal(migrated.rowCount,1);
  const columns=await c.query(`SELECT a.attname,a.attnotnull,
   pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_value
   FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
   ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='walkin_manual_claims'::regclass AND a.attname IN
   ('entry_id','claim_hash','claim_expires_at','customer_id','consent_at')
   AND a.attnum>0 AND NOT a.attisdropped`);
  const byCol=new Map(columns.rows.map(x=>[x.attname,x]));
  assert.equal(byCol.size,5);
  assert.equal(byCol.get('consent_at')?.default_value,null,'No automatic consent allowed');
  assert.equal(byCol.get('customer_id')?.default_value,null,'No automatic customer binding allowed');
  const constraints=await c.query(`SELECT c.conname,c.contype,c.convalidated
    FROM pg_catalog.pg_constraint c WHERE c.conrelid='walkin_manual_claims'::regclass`);
  const names=new Set(constraints.rows.filter(x=>x.convalidated).map(x=>x.conname));
  for(const name of ['walkin_manual_claims_pkey','walkin_manual_claims_claim_hash_key',
    'walkin_manual_consent_valid','walkin_manual_no_reusable_secret','walkin_manual_claim_proof'])
   assert.ok(names.has(name),`Missing validated manual consent constraint: ${name}`);
 }finally{if(c)c.release();await db.end();}
});
