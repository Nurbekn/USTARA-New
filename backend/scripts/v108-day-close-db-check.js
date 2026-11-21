'use strict';
// #153 v108: strictly local, explicit-opt-in, READ-ONLY PostgreSQL evidence.
// Never creates/migrates/drops any table or changes guest/bookings/queue data.
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const {verifyMigrationLedger}=require('./v40-staging');
const AUTH='I_AUTHORIZE_READ_ONLY_TEST';
const LOCK_KEY=2147483647; // reserved maximum int4; no barber record is accessed.
function validateEnv(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V108_DAY_CLOSE_READINESS!==AUTH)
  throw Error('v108: explicit read-only local test authorization required; NOT_RUN');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'v108 day-close DB',['ustara_account_test']);
 if(target.host!=='127.0.0.1'||target.port!==5432)
  throw Error('v108: only local 127.0.0.1:5432 PostgreSQL allowed; NOT_RUN');
 return target;
}
async function verifySchema(client,target){
 await assertTestConnection(client,target,'ustara_account_test');
 await verifyMigrationLedger(client);
 const r=await client.query(`SELECT
  current_schema()='public' AS public_schema,
  current_setting('transaction_read_only')='on' AS read_only,
  EXISTS(SELECT 1 FROM public.ustara_schema_migrations WHERE version='20261216_safe_day_close') AS migration_present,
  pg_catalog.to_regclass('public.barber_day_closures') IS NOT NULL AS closure_table,
  pg_catalog.to_regclass('public.barber_day_close_events') IS NOT NULL AS audit_table,
  EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.barber_day_closures'::regclass
    AND c.contype='p' AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%(barber_id, local_date)%') AS scoped_pk,
  EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.barber_day_closures'::regclass
    AND c.contype='c' AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%is_closed%') AS closure_state_check,
  EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.barber_day_close_events'::regclass
    AND c.contype='u' AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%(barber_id, local_date, revision)%') AS unique_audit,
  EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='ustara_effective_day_schedule' AND p.provolatile='s'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) LIKE '%integer%'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) LIKE '%date%'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%barber_day_closures%'
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%NOT EXISTS%') AS schedule_fenced`);
 const state=r.rows[0];
 if(r.rowCount!==1||!state||Object.values(state).some(v=>v!==true))
  throw Error('v108: day-close database schema/authorization evidence mismatch; NOT_PASS');
 return {schema:'public',readOnly:true,migrations:63,closureTable:true,audit:true,
  scopedPrimaryKey:true,closureStateCheck:true,uniqueAudit:true,scheduleFence:true};
}
async function verifyAdvisorySerialization(first,second){
 // Both transactions must already be in READ ONLY. No DML or production rows.
 const sql='SELECT pg_catalog.pg_try_advisory_xact_lock($1::integer) AS acquired';
 const acquired=async c=>(await c.query(sql,[LOCK_KEY])).rows[0]?.acquired;
 if(await acquired(first)!==true)throw Error('v108: test advisory lock unavailable; NOT_PASS');
 if(await acquired(second)!==false)throw Error('v108: concurrent transaction escaped advisory lock; NOT_PASS');
 await first.query('ROLLBACK');
 if(await acquired(second)!==true)throw Error('v108: advisory lock not released after rollback; NOT_PASS');
 return {sameKeyBlocksConcurrentWriters:true,rollbackReleasesLock:true};
}
async function run(env=process.env,PoolConstructor){
 const target=validateEnv(env);
 const Pool=PoolConstructor||require('pg').Pool;
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:2,
  connectionTimeoutMillis:5000,application_name:'ustara_v108_read_only',
  options:'-c search_path=public -c default_transaction_read_only=on'});
 let first,second,brokenFirst=false,brokenSecond=false;
 try{
  first=await pool.connect();second=await pool.connect();
  await first.query('BEGIN READ ONLY');await second.query('BEGIN READ ONLY');
  const schema=await verifySchema(first,target);
  await assertTestConnection(second,target,'ustara_account_test');
  const secondRead=await second.query("SELECT current_schema()='public' AS schema_ok, current_setting('transaction_read_only')='on' AS read_only");
  if(secondRead.rows[0]?.schema_ok!==true||secondRead.rows[0]?.read_only!==true)
   throw Error('v108: second connection is not read only; NOT_PASS');
  const lock=await verifyAdvisorySerialization(first,second);
  await second.query('ROLLBACK');
  return {status:'PASS',database:'ustara_test_db',...schema,...lock};
 }finally{
  if(first){try{await first.query('ROLLBACK');}catch{brokenFirst=true;}first.release(brokenFirst);}
  if(second){try{await second.query('ROLLBACK');}catch{brokenSecond=true;}second.release(brokenSecond);}
  await pool.end();
 }
}
if(require.main===module)run().then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateEnv,verifySchema,verifyAdvisorySerialization,run};
