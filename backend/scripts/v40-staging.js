'use strict';
// v40: explicit operator opt-in for local, non-superuser PostgreSQL only.
// Performs read-only v39 schema checks before running the existing 5 staging
// tests. Does not create any tables or connect when configuration is invalid.
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const {readBootstrapPlan}=require('./bootstrap-plan');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
const TESTS=Object.freeze([
 'smartBookingV28.postgres.integration.test.js',
 'manualQueueV29.postgres.integration.test.js',
 'smartBookingV30.postgres.integration.test.js',
 'smartBookingV35.postgres.integration.test.js',
 'queueSelfExitV37.postgres.integration.test.js'
]);
function validateConfig(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V40_STAGING!==AUTH||!env.USTARA_TEST_DATABASE_URL)
  throw new Error('v40: explicit NODE_ENV=test, USTARA_V40_STAGING and local test URL required');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'USTARA v40 staging',['ustara_account_test']);
 return {target,tests:TESTS};
}
// Node's test runner exits 0 even if an entire integration test was SKIPPED.
// v41 therefore verifies TAP totals, not just process exit status.
function parseTapSummary(output){
 const transcript=String(output||'');
 // A bare six-line summary is not evidence that node:test ran at all.
 // Bail-outs and explicit test failures are never considered a green run.
 if(!/^TAP version 13\r?$/m.test(transcript)||
    /^[ \t]*not ok[ \t]+[1-9][0-9]*\b/m.test(transcript)||
    /^[ \t]*ok[ \t]+[1-9][0-9]*[ \t]+-[^\r\n]*#[ \t]*(?:SKIP|TODO)\b/im.test(transcript)||
    /^Bail out!/mi.test(transcript))
  throw new Error('v61: failed/skipped nested TAP or missing header; NOT PASS');
 // v55: totals without the actual test result lines are not evidence.
 // Node's TAP reporter emits one unindented `ok N - ...` per top-level test
 // and a terminal `1..N` plan. Nested results remain indented.
 const headers=[...transcript.matchAll(/^TAP version 13\r?$/gm)];
 const plans=[...transcript.matchAll(/^1\.\.([0-9]+)\r?$/gm)];
 if(headers.length!==1||plans.length!==1)throw new Error('v55: missing or repeated TAP header/plan; NOT PASS');
 const plan=Number(plans[0][1]);
 const witnessed=[...transcript.matchAll(/^ok ([1-9][0-9]*) - [^\r\n]+\r?$/gm)];
 const nested=[...transcript.matchAll(/^[ \t]+ok ([1-9][0-9]*) - [^\r\n]+\r?$/gm)];
 if(!Number.isSafeInteger(plan)||plan<1||witnessed.length!==plan||
    witnessed.some((m,i)=>Number(m[1])!==i+1))
  throw new Error('v55: TAP test result lines disagree with plan; NOT PASS');
 const summary={};
 for(const match of transcript.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)){
  if(Object.hasOwn(summary,match[1]))throw new Error('v43: repeated TAP summary is NOT PASS');
  summary[match[1]]=Number(match[2]);
 }
 const required=['tests','pass','fail','cancelled','skipped','todo'];
 if(required.some(key=>!Object.hasOwn(summary,key))||
    !Number.isSafeInteger(summary.tests)||summary.tests<1||summary.pass!==summary.tests||
    (summary.fail||0)>0||(summary.skipped||0)>0||(summary.cancelled||0)>0||
    (summary.todo||0)>0 ||
    Object.entries(summary).some(([,value])=>!Number.isSafeInteger(value)) ||
    summary.pass+(summary.fail||0)+(summary.cancelled||0)+(summary.skipped||0)+(summary.todo||0)!==summary.tests ||
    plan+nested.length!==summary.tests)
  throw new Error('v41: staging test not fully executed; zero/skip/fail/todo is NOT PASS');
 return summary;
}
function runVerifiedTest({file,backend,env,spawn=spawnSync}){
 const result=spawn(process.execPath,['--test',path.join(backend,'test',file)],{
  cwd:backend,env,encoding:'utf8',maxBuffer:4*1024*1024,timeout:90000});
 if(result.error||result.signal||result.status!==0)
  throw new Error(`v41: staging test failed or timed out: ${file}`);
 const totals=parseTapSummary(result.stdout);
 process.stdout.write(`v41 staging: ${file}: ${totals.pass}/${totals.tests} PASS, 0 skipped\n`);
 return totals;
}
function expectedMigrationVersions(){
 return readBootstrapPlan().filter(({file})=>file.startsWith('migrations/'))
  .map(({file})=>path.basename(file,'.sql'));
}
async function verifyMigrationLedger(client,expected=expectedMigrationVersions()){
 if(!Array.isArray(expected)||expected.length!==63||new Set(expected).size!==expected.length)
  throw new Error('v42: expected forward migrations must contain 63 unique versions');
 const result=await client.query('SELECT version FROM ustara_schema_migrations ORDER BY version');
 const actual=result.rows.map(row=>row.version);
 if(actual.some(v=>typeof v!=='string')||actual.length!==expected.length||
    JSON.stringify(actual)!==JSON.stringify([...expected].sort()))
  throw new Error('v42: staging database migration ledger does not match the 63 checked-in forward migrations');
 return true;
}
async function verifyV39Migration(client){
 // Parameterless read-only check. It must not mutate live data, run DDL,
 // or auto-apply a migration when missing.
 const guard=await client.query(`SELECT current_schema() AS active_schema,
   current_setting('transaction_read_only') AS read_only`);
 if(guard.rows[0]?.active_schema!=='public'||guard.rows[0]?.read_only!=='on')
  throw new Error('v41: staging preflight requires public schema and read-only connection');
 const result=await client.query(`SELECT
  EXISTS(SELECT 1 FROM ustara_schema_migrations
    WHERE version='20261213_queue_delivery_uncertain') AS migration_recorded,
  EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass('walkin_queue_notification_outbox')
      AND c.conname='walkin_queue_notification_delivery_status'
      AND c.contype='c' AND c.convalidated
      AND position('uncertain' in pg_catalog.pg_get_constraintdef(c.oid))>0) AS constraint_present`);
 if(result.rows[0]?.migration_recorded!==true||result.rows[0]?.constraint_present!==true)
  throw new Error('v40: v39 migration or valid queue outbox constraint missing in staging DB');
 return true;
}
async function run(env=process.env){
 const {target,tests}=validateConfig(env);
 let Pool;try{({Pool}=require('pg'));}catch{throw new Error('v40: pg missing; run npm ci in backend before staging');}
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000,statement_timeout:8000,application_name:'ustara_v41_readonly_preflight',
  options:'-c search_path=public -c default_transaction_read_only=on'});
 try{
  const client=await pool.connect();
  try{await assertTestConnection(client,target,'ustara_account_test');await verifyV39Migration(client);await verifyMigrationLedger(client);}
  finally{client.release();}
 }finally{await pool.end();}
 const safeEnv={...env,NODE_ENV:'test',
  USTARA_SMART_BOOKING_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_MANUAL_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_SMART_V30_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_V35_ROW_LOCK_TEST:'I_AUTHORIZE_EPHEMERAL_SCHEMA',
  USTARA_V37_QUEUE_EXIT_AUDIT:'I_AUTHORIZE_EPHEMERAL_SCHEMA'};
 const backend=path.resolve(__dirname,'..');
 for(const file of tests)runVerifiedTest({file,backend,env:safeEnv});
 process.stdout.write('v41: five PostgreSQL test files all executed (no skips).\n');
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateConfig,verifyV39Migration,verifyMigrationLedger,expectedMigrationVersions,parseTapSummary,runVerifiedTest,run,TESTS};
