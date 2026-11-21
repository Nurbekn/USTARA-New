'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateV49}=require('../scripts/v49-staging');
test('v49 staging refuses empty or incomplete authorization before any DB connection',()=>{
 for(const env of [{},{NODE_ENV:'test'},{NODE_ENV:'test',USTARA_V49_STAGING:'I_AUTHORIZE_LOCAL_STAGING'}]){
  assert.throws(()=>validateV49(env));
 }
});
test('v49 ephemeral row lock test is disabled unless there is an explicit local test URL and opt-in',()=>{
 const fs=require('node:fs');const path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'v49ConsentLock.postgres.integration.test.js'),'utf8');
 assert.match(src,/USTARA_V49_CLAIM_LOCK_TEST==='I_AUTHORIZE_EPHEMERAL_SCHEMA'/);
 assert.match(src,/assertTestConnection\(a,target,USER\)/);
 assert.match(src,/assertOwnedTestSchema\(a,target,schema,USER/);
 assert.match(src,/DROP SCHEMA/);
 assert.doesNotMatch(src,/DROP TABLE (?:public\.|users|bookings)/i);
});
