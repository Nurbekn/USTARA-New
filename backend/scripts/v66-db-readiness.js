'use strict';
// Read-only verification of freshly bootstrapped isolated CI PostgreSQL.
// Does not create, repair, or drop tables; never accepts a production URL.
const {testTarget,assertTestConnection}=require('../test/helpers/testDatabaseTarget');
const {verifyMigrationLedger}=require('./v40-staging');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
function validateDbEnv(env){
 if(env.NODE_ENV!=='test'||env.USTARA_V54_STAGING!==AUTH)
  throw Error('v66: authorized local test connection required; NOT PASS');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'v66 PostgreSQL readiness',['ustara_account_test']);
 if(target.host!=='127.0.0.1'||target.port!==5432)
  throw Error('v66: remote PostgreSQL is prohibited; NOT PASS');
 return target;
}
async function verifyDbReadiness(client,target){
 await assertTestConnection(client,target,'ustara_account_test');
 const meta=(await client.query(`SELECT current_schema() AS schema,
  current_setting('transaction_read_only') AS read_only,
  EXISTS(SELECT 1 FROM pg_catalog.pg_extension e
    WHERE e.extname='btree_gist' AND e.extnamespace='public'::regnamespace) AS gist,
  pg_catalog.to_regclass('public.users') IS NOT NULL AS users_present,
  pg_catalog.to_regclass('public.smart_booking_offers') IS NOT NULL AS offers_present`)).rows[0];
 if(meta?.schema!=='public'||meta.read_only!=='on'||meta.gist!==true||
    meta.users_present!==true||meta.offers_present!==true)
  throw Error('v66: bootstrap schema, extension or read-only state invalid; NOT PASS');
 await verifyMigrationLedger(client);
 const role=(await client.query(`SELECT r.rolcanlogin AS can_login,r.rolsuper AS superuser,
   pg_catalog.pg_has_role('ustara_login_test','ustara_account_test','USAGE') AS inherits_owner,
   pg_catalog.has_database_privilege('ustara_login_test',current_database(),'CONNECT') AS can_connect
  FROM pg_catalog.pg_roles r WHERE r.rolname='ustara_login_test'`)).rows[0];
 if(!role||role.can_login!==true||role.superuser!==false||
    role.inherits_owner!==true||role.can_connect!==true)
  throw Error('v66: E2E login role is missing, privileged or unable to inherit test grants; NOT PASS');
 return {database:'ustara_test_db',migrations:63,loginRole:'non_superuser',status:'PASS'};
}
async function run(env=process.env,createPool){
 const target=validateDbEnv(env);
 const {Pool}=createPool?{Pool:createPool}:require('pg');
 const pool=new Pool({connectionString:env.USTARA_TEST_DATABASE_URL,ssl:false,max:1,
  connectionTimeoutMillis:5000});
 let client;
 try{
  client=await pool.connect();
  await client.query('BEGIN READ ONLY');
  const result=await verifyDbReadiness(client,target);
  await client.query('ROLLBACK');
  return result;
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});throw e;}
 finally{client?.release();await pool.end();}
}
if(require.main===module)run().then(result=>console.log(JSON.stringify(result)))
 .catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateDbEnv,verifyDbReadiness,run};
