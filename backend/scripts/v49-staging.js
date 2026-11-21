'use strict';
// Strict local-only staging wrapper: six existing real PG suites followed by
// a new two-connection consent race test. Any SKIP/failure is NOT a PASS.
const path=require('node:path');
const {run:runPrevious,validateV46}=require('./v46-staging');
const {runVerifiedTest}=require('./v40-staging');
function validateV49(env){
 if(env.USTARA_V49_STAGING!=='I_AUTHORIZE_LOCAL_STAGING')
  throw new Error('v49: explicit staging authorization required');
 return validateV46(env);
}
async function run(env=process.env){
 validateV49(env);
 await runPrevious(env);
 runVerifiedTest({file:'v49ConsentLock.postgres.integration.test.js',
  backend:path.resolve(__dirname,'..'),
  env:{...env,NODE_ENV:'test',USTARA_V49_CLAIM_LOCK_TEST:'I_AUTHORIZE_EPHEMERAL_SCHEMA'}});
 process.stdout.write('v49: seven real PostgreSQL test files PASS, zero SKIP.\n');
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateV49,run};
