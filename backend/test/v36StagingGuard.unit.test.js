'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig}=require('../scripts/v36-staging');
const flag='I_AUTHORIZE_LOCAL_STAGING';
const good={NODE_ENV:'test',USTARA_V36_STAGING:flag,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:password@127.0.0.1:5432/ustara_test_db'};
test('v36 real DB runner refuses absent opt-in, production env and unknown DB target',()=>{
 for(const bad of [
  {...good,NODE_ENV:'production'},
  {...good,USTARA_V36_STAGING:'1'},
  {...good,USTARA_TEST_DATABASE_URL:''},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:password@db.example.com:5432/ustara_test_db'},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:password@127.0.0.1:5432/ustara_production'},
  {...good,USTARA_TEST_DATABASE_URL:'postgresql://postgres:password@127.0.0.1:5432/ustara_test_db'},
 ])assert.throws(()=>validateConfig(bad));
});
test('v36 staging plan is strictly scoped to four known scripts with authorized test role',()=>{
 const result=validateConfig(good);
 assert.equal(result.target.sessionUser,'ustara_account_test');
 assert.equal(result.tests.length,4);
 assert.ok(result.tests.every(x=>/^\w+\.postgres\.integration\.test\.js$/.test(x)));
});
