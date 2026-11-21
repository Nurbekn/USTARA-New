'use strict';
// Ninth isolated PostgreSQL suite. Requires every earlier staging gate; no
// skipping or package-missing result counts as a successful integration run.
const path=require('node:path');
const {run:runV53,validateV53}=require('./v53-staging');
const {runVerifiedTest}=require('./v40-staging');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
function validateV54(env){
 if(env.USTARA_V54_STAGING!==AUTH)
  throw new Error('v54: explicit USTARA_V54_STAGING opt-in required');
 return validateV53(env);
}
async function run(env=process.env){
 validateV54(env);
 await runV53(env);
 runVerifiedTest({file:'v54QrShopWorker.postgres.integration.test.js',
  backend:path.resolve(__dirname,'..'),
  env:{...env,NODE_ENV:'test',USTARA_V54_DB_FENCE:'I_AUTHORIZE_EPHEMERAL_SCHEMA'}});
 process.stdout.write('v54: nine real PostgreSQL suites PASS, zero SKIP.\n');
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateV54,run};
