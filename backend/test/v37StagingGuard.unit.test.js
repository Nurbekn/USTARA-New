'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig}=require('../scripts/v37-staging');
const good={NODE_ENV:'test',USTARA_V37_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:dummy@127.0.0.1:5432/ustara_test_db'};
test('v37 staging refuses production, public DB, remote host and superuser before connection',()=>{
 for(const env of [
  {...good,NODE_ENV:'production'},
  {...good,USTARA_V37_STAGING:'true'},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:dummy@db.example.org/ustara_test_db'},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:dummy@127.0.0.1/production'},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://postgres:dummy@127.0.0.1/ustara_test_db'},
 ])assert.throws(()=>validateConfig(env));
});
test('v37 staging runs exactly five audited DB suites and new exit test is opt-in only',()=>{
 const r=validateConfig(good);
 assert.equal(r.target.sessionUser,'ustara_account_test');
 assert.equal(r.tests.length,5);
 assert.ok(r.tests.includes('queueSelfExitV37.postgres.integration.test.js'));
 assert.ok(r.tests.every(x=>/^\w+\.postgres\.integration\.test\.js$/.test(x)));
});
