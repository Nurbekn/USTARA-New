'use strict';
// Opt-in read-only, TWO-SESSION PostgreSQL staging verification.
// This test checks actual index presence and advisory-lock serialization.
// It does NOT prove business-level claim/revoke/confirm concurrency without fixtures.
// Never point to production: only localhost ustara_test_db + ustara_account_test.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {testTarget,assertTestConnection}=require('./helpers/testDatabaseTarget');
const enabled=process.env.NODE_ENV==='test' &&
 process.env.USTARA_SMART_V30_DB_AUDIT==='I_AUTHORIZE_READ_ONLY_TEST' &&
 Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('v30 read-only real PG: active-entry partial UNIQUE and two-session lock serialization',
 {skip:!enabled,timeout:30000},async()=>{
 const target=testTarget(process.env.USTARA_TEST_DATABASE_URL,'USTARA v30 Smart Booking audit',['ustara_account_test']);
 const {Pool}=require('pg'); // never import when opt-in is off
 const pool=new Pool({connectionString:process.env.USTARA_TEST_DATABASE_URL,
  ssl:false,max:2,connectionTimeoutMillis:5000,statement_timeout:8000,
  application_name:'ustara_v30_read_only_audit',
  options:'-c search_path=public -c default_transaction_read_only=on'});
 let c1,c2;
 try{
  c1=await pool.connect();c2=await pool.connect();
  await assertTestConnection(c1,target,'ustara_account_test');
  await assertTestConnection(c2,target,'ustara_account_test');
  await c1.query('BEGIN READ ONLY');await c2.query('BEGIN READ ONLY');
  const context=await c1.query(`SELECT current_schema() AS name,
   current_setting('transaction_read_only') AS read_only`);
  assert.deepEqual(context.rows[0],{name:'public',read_only:'on'});
  const migrated=await c1.query(`SELECT version FROM ustara_schema_migrations
   WHERE version='20261211_smart_booking_active_entry'`);
  assert.equal(migrated.rowCount,1);
  const indexes=await c1.query(`SELECT i.indisunique,i.indisvalid,i.indisready,
     pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,
     pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class cls ON cls.oid=i.indexrelid
    WHERE cls.relname='smart_booking_one_active_entry'
      AND i.indrelid='smart_booking_offers'::regclass`);
  assert.equal(indexes.rowCount,1);
  const idx=indexes.rows[0];
  assert.equal(idx.indisunique,true);
  assert.equal(idx.indisvalid,true);
  assert.equal(idx.indisready,true);
  assert.match(idx.definition,/UNIQUE INDEX/);
  assert.match(idx.definition,/\(entry_id\)/);
  assert.match(idx.predicate,/pending/);
  assert.match(idx.predicate,/accepted/);
  // Reserved NEGATIVE key: never a real positive barber ID. No data writes.
  const key='-1888888800';
  await c1.query('SELECT pg_advisory_xact_lock($1::bigint)',[key]);
  const busy=await c2.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',[key]);
  assert.equal(busy.rows[0].acquired,false,'second connection must not own first connection lock');
  await c1.query('ROLLBACK');
  const released=await c2.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',[key]);
  assert.equal(released.rows[0].acquired,true,'lock should be released after rollback');
 }finally{
  if(c1){try{await c1.query('ROLLBACK');}catch{}c1.release();}
  if(c2){try{await c2.query('ROLLBACK');}catch{}c2.release();}
  await pool.end();
 }
});
