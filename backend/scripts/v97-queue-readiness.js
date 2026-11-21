'use strict';
// Read-only v97 check for the *isolated, local* USTARA test database.
// No automatic migrations, DDL, writes or production connection fallbacks.
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const {verifyMigrationLedger}=require('./v40-staging');
const AUTH='I_AUTHORIZE_READ_ONLY_TEST';
function validateEnv(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V97_QUEUE_READINESS!==AUTH)
  throw Error('v97: explicit local read-only test authorization required; NOT RUN');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'v97 queue readiness',['ustara_account_test']);
 if(target.host!=='127.0.0.1'||target.port!==5432)
  throw Error('v97: only local PostgreSQL on 127.0.0.1:5432 is allowed');
 return target;
}
async function verifyQueueReadiness(client,target){
 await assertTestConnection(client,target,'ustara_account_test');
 await verifyMigrationLedger(client);
 const result=await client.query(`SELECT
    current_schema()='public' AS right_schema,
    current_setting('transaction_read_only')='on' AS read_only,
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.walkin_queue'::regclass AND a.attname='arrived_at'
        AND a.atttypid='timestamptz'::regtype AND NOT a.attisdropped) AS arrival_column,
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.walkin_queue'::regclass AND a.attname='started_at'
        AND a.atttypid='timestamptz'::regtype AND NOT a.attisdropped) AS started_column,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.walkin_queue'::regclass AND c.conname='walkin_queue_state_dates'
        AND c.contype='c' AND c.convalidated
        AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%arrived%'
        AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%in_service%') AS state_check,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid='public.walkin_queue_events'::regclass
        AND c.conname='walkin_queue_events_action_check' AND c.contype='c' AND c.convalidated
        AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%arrived%') AS audit_check,
    EXISTS (SELECT 1 FROM pg_catalog.pg_indexes i
      WHERE i.schemaname='public' AND i.indexname='walkin_queue_one_called_per_day'
        AND i.indexdef LIKE '%arrived%' AND i.indexdef LIKE '%in_service%'
        AND i.indexdef LIKE '%UNIQUE%') AS one_active_index`);
 const state=result.rows[0];
 if(!state||Object.values(state).some(value=>value!==true))
  throw Error('v97: 48 migration queue schema does not match active state constraints; NOT PASS');
 return {status:'PASS',database:'ustara_test_db',migrations:63,readOnly:true,
  arrivalColumn:true,serviceColumn:true,queueStateConstraint:true,auditConstraint:true,
  singleActiveIndex:true};
}
async function run(env=process.env,PoolConstructor){
 const target=validateEnv(env);
 const Pool=PoolConstructor||require('pg').Pool;
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000,application_name:'ustara_v97_read_only',
  options:'-c search_path=public -c default_transaction_read_only=on'});
 let client,inTx=false,broken=false;
 try{
  client=await pool.connect();
  await client.query('BEGIN READ ONLY');inTx=true;
  const result=await verifyQueueReadiness(client,target);
  await client.query('ROLLBACK');inTx=false;
  return result;
 }catch(e){
  if(client&&inTx)try{await client.query('ROLLBACK');}catch{broken=true;}
  throw e;
 }finally{
  if(client)client.release(broken);
  await pool.end();
 }
}
if(require.main===module)run().then(data=>console.log(JSON.stringify(data)))
  .catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateEnv,verifyQueueReadiness,run};
