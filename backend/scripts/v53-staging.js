'use strict';
// Eighth isolated local PostgreSQL suite. No production connection is accepted.
// All previous strict suites must pass first; SKIP never counts as PASS.
const path=require('node:path');
const {run:runPrevious,validateV49}=require('./v49-staging');
const {runVerifiedTest}=require('./v40-staging');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
function validateV53(env){
 if(env.USTARA_V53_STAGING!==AUTH)
  throw new Error('v53: explicit USTARA_V53_STAGING opt-in required');
 return validateV49(env);
}
async function run(env=process.env){
 validateV53(env);
 await runPrevious(env);
 runVerifiedTest({file:'v53QrFinalBoundaries.postgres.integration.test.js',
  backend:path.resolve(__dirname,'..'),
  env:{...env,NODE_ENV:'test',USTARA_V53_DB_BOUNDARY:'I_AUTHORIZE_EPHEMERAL_SCHEMA'}});
 process.stdout.write('v53: eight real PostgreSQL suites PASS, zero SKIP.\n');
}
if(require.main===module)run().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateV53,run};
