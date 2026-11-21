'use strict';
// Explicit, narrowly scoped, LOCAL test-DB runner. Never creates migrations,
// accounts or tables outside the already existing test's ephemeral owned schema.
// Importing this file does not connect to a DB or read any real credentials.
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const CONSENT='I_AUTHORIZE_LOCAL_STAGING';
function validateConfig(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V36_STAGING!==CONSENT||!env.USTARA_TEST_DATABASE_URL)
  throw new Error('Faqat NODE_ENV=test va USTARA_V36_STAGING=I_AUTHORIZE_LOCAL_STAGING bilan ruxsat etiladi.');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'USTARA v36 staging',['ustara_account_test']);
 return {target,tests:[
  'smartBookingV28.postgres.integration.test.js',
  'manualQueueV29.postgres.integration.test.js',
  'smartBookingV30.postgres.integration.test.js',
  'smartBookingV35.postgres.integration.test.js'
 ]};
}
async function run(env=process.env){
 const config=validateConfig(env); // validate BEFORE pg import / any connection
 let Pool;try{({Pool}=require('pg'));}catch{throw new Error('PostgreSQL driver pg o‘rnatilmagan: backend katalogida npm ci bajaring.');}
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000,statement_timeout:8000,application_name:'ustara_v36_preflight'});
 try{
  const c=await pool.connect();try{await assertTestConnection(c,config.target,'ustara_account_test');}finally{c.release();}
 }finally{await pool.end();}
 const safeEnv={...env,NODE_ENV:'test',
  USTARA_SMART_BOOKING_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_MANUAL_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_SMART_V30_DB_AUDIT:'I_AUTHORIZE_READ_ONLY_TEST',
  USTARA_V35_ROW_LOCK_TEST:'I_AUTHORIZE_EPHEMERAL_SCHEMA'};
 const backend=path.resolve(__dirname,'..');
 // Stable test order, fail closed; NO shell and no credentials printed.
 for(const file of config.tests){
  process.stdout.write(`Staging test: ${file}\n`);
  const r=spawnSync(process.execPath,['--test',path.join(backend,'test',file)],{
   cwd:backend,env:safeEnv,stdio:'inherit',timeout:90000});
  if(r.error||r.status!==0)throw new Error(`Staging test muvaffaqiyatsiz: ${file}`);
 }
 process.stdout.write('Staging PASS: 4 ta test fayli haqiqiy test bazasida ishlatildi.\n');
}
if(require.main===module){run().catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={validateConfig,run};
