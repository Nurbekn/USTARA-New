'use strict';
// A strictly offline, package-free CI configuration preflight. Running this
// before npm ci makes an unsafe test target or missing public API configuration
// fail closed without connecting to any database, GitHub API or production app.
const {testTarget}=require('../test/helpers/testDatabaseTarget');
const {validateProductionApiBaseUrl}=require('../../scripts/production-api-url.cjs');
const AUTH='I_AUTHORIZE_LOCAL_STAGING';
function verifyCiPreflight(env=process.env){
 if(env.GITHUB_ACTIONS!=='true'||env.NODE_ENV!=='test')
  throw Error('v66: only isolated GitHub NODE_ENV=test is supported; NOT PASS');
 const event=env.GITHUB_EVENT_NAME;
 if(!['push','pull_request','workflow_dispatch'].includes(event)||
    (event==='push'&&env.GITHUB_REF!=='refs/heads/main'))
  throw Error('v66: unknown CI event/ref; NOT PASS');
 const target=testTarget(env.USTARA_TEST_DATABASE_URL,'v66 CI target',['ustara_account_test']);
 if(target.host!=='127.0.0.1'||target.port!==5432||target.database!=='ustara_test_db')
  throw Error('v66: CI database must be local ephemeral PostgreSQL on 127.0.0.1:5432; NOT PASS');
 for(const key of ['USTARA_V40_STAGING','USTARA_V46_STAGING','USTARA_V49_STAGING',
   'USTARA_V53_STAGING','USTARA_V54_STAGING'])
  if(env[key]!==AUTH)throw Error('v66: missing explicit isolated staging authorization; NOT PASS');
 validateProductionApiBaseUrl(env.VITE_API_BASE_URL);
 return {environment:'isolated-ci-only',database:'ustara_test_db',role:'ustara_account_test',
  api:'valid_https_origin',event,releaseApproval:false};
}
if(require.main===module){
 try{console.log(JSON.stringify(verifyCiPreflight()));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={verifyCiPreflight};
