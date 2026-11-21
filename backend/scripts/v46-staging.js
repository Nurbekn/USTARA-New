'use strict';
// Reuse the existing strict five-file staging checks, THEN run the v46
// isolated SQL lifecycle test. A SKIP is never counted as success.
const path=require('node:path');
const {run:runPrevious,validateConfig,runVerifiedTest}=require('./v40-staging');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
function validateV46(env){
 if(env.USTARA_V46_STAGING!==AUTH)
  throw new Error('v46: explicit USTARA_V46_STAGING opt-in required');
 return validateConfig(env); // validates local DB name, host and test user
}
async function run(env=process.env){
 validateV46(env);
 await runPrevious(env);
 const backend=path.resolve(__dirname,'..');
 runVerifiedTest({file:'v46QueueLifecycle.postgres.integration.test.js',backend,
  env:{...env,NODE_ENV:'test',USTARA_V46_QUEUE_LIFECYCLE:'I_AUTHORIZE_EPHEMERAL_SCHEMA'}});
 process.stdout.write('v46: six real PostgreSQL test files PASS, 0 SKIP.\n');
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateV46,run};
