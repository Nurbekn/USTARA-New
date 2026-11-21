'use strict';
// v112: optional integration proof for a local test PostgreSQL ONLY.
// Read-only by default at the session level. Never changes data or schema.
// A missing server, migration or permission is NOT_RUN / NOT_PASS, never PASS.
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const {verifyMigrationLedger}=require('./v40-staging');
const {verifyAdvisorySerialization}=require('./v108-day-close-db-check');
const AUTH='I_AUTHORIZE_READ_ONLY_TEST';
function validateEnv(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V112_SCHEDULE_DB_READINESS!==AUTH)
  throw Error('v112: explicit local READ ONLY test authorization required; NOT_RUN');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'v112 schedule DB',['ustara_account_test']);
 if(target.host!=='127.0.0.1'||target.port!==5432)
  throw Error('v112: only local 127.0.0.1:5432 allowed; NOT_RUN');
 return target;
}
async function verifyReadSnapshot(client,target){
 await assertTestConnection(client,target,'ustara_account_test');
 const status=await client.query(`SELECT
   current_schema()='public' AS schema_ok,
   current_setting('transaction_read_only')='on' AS read_only,
   current_setting('transaction_isolation')='repeatable read' AS repeatable_read,
   transaction_timestamp() AS snapshot_time`);
 const state=status.rows?.[0];
 if(status.rowCount!==1||state.schema_ok!==true||state.read_only!==true||
   state.repeatable_read!==true||!state.snapshot_time)
  throw Error('v112: missing read-only repeatable-read snapshot; NOT_PASS');
 await verifyMigrationLedger(client);
 // SELECT LIMIT 0 checks that all three protected read paths are compiled,
 // have live tables and are accessible to the test role; no barber records
 // are read or changed, even if the database contains test data.
 for(const table of ['barber_calendar_exceptions','barber_weekly_breaks','barber_date_breaks']){
  const probe=await client.query(`SELECT 1 FROM public.${table} LIMIT 0`);
  if(probe.rowCount!==0)throw Error('v112: read-only table probe returned unexpected data; NOT_PASS');
 }
 const clock=await client.query('SELECT transaction_timestamp() AS snapshot_time');
 if(clock.rowCount!==1 || new Date(clock.rows[0]?.snapshot_time).getTime()!==
   new Date(state.snapshot_time).getTime())
  throw Error('v112: snapshot clock unexpectedly changed; NOT_PASS');
 return {repeatableRead:true,readOnly:true,authorizedTestRole:true,migrations:63,
  threeScheduleReadTables:true,snapshotClockStable:true};
}
async function run(env=process.env,PoolConstructor){
 const target=validateEnv(env); // All inputs validated BEFORE pg connection.
 let Pool=PoolConstructor;
 if(!Pool)try{({Pool}=require('pg'));}catch{
  throw Error('v112: pg package missing; install backend dependencies; NOT_RUN');
 }
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:2,
  connectionTimeoutMillis:5000,statement_timeout:8000,
  application_name:'ustara_v112_readonly_schedule',
  options:'-c search_path=public -c default_transaction_read_only=on'});
 let a,b,brokenA=false,brokenB=false;
 try{
  a=await pool.connect();b=await pool.connect();
  await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await b.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const schema=await verifyReadSnapshot(a,target);
  await assertTestConnection(b,target,'ustara_account_test');
  const other=await b.query(`SELECT current_schema()='public' AS schema_ok,
    current_setting('transaction_read_only')='on' AS read_only,
    current_setting('transaction_isolation')='repeatable read' AS repeatable_read`);
  if(other.rows[0]?.schema_ok!==true||other.rows[0]?.read_only!==true||
    other.rows[0]?.repeatable_read!==true)
   throw Error('v112: second snapshot is not read-only; NOT_PASS');
  const mutex=await verifyAdvisorySerialization(a,b);
  await b.query('ROLLBACK');
  return {status:'PASS',database:'ustara_test_db',...schema,...mutex};
 }finally{
  if(a){try{await a.query('ROLLBACK');}catch{brokenA=true;}a.release(brokenA);}
  if(b){try{await b.query('ROLLBACK');}catch{brokenB=true;}b.release(brokenB);}
  await pool.end();
 }
}
if(require.main===module)run().then(result=>console.log(JSON.stringify(result)))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={validateEnv,verifyReadSnapshot,run};
