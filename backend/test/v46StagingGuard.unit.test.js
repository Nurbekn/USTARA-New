'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateV46}=require('../scripts/v46-staging');
const good={NODE_ENV:'test',USTARA_V40_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_V46_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test@127.0.0.1/ustara_test_db'};
test('v46 staging refuses missing explicit confirmation',()=>{
 assert.throws(()=>validateV46({...good,USTARA_V46_STAGING:''}),/v46/);
 assert.throws(()=>validateV46({...good,NODE_ENV:'production'}),/v40|test/);
});
test('v46 staging refuses non-test or remote database',()=>{
 assert.throws(()=>validateV46({...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test@example.com/ustara_test_db'}),/local/);
 assert.throws(()=>validateV46({...good,USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test@localhost/ustara_prod'}),/ustara_test_db/);
 assert.throws(()=>validateV46({...good,USTARA_TEST_DATABASE_URL:'postgresql://postgres@localhost/ustara_test_db'}),/test user/);
});
test('v46 opt-in permits only explicit local test role and database',()=>{
 const result=validateV46(good);
 assert.equal(result.target.database,'ustara_test_db');
 assert.equal(result.target.sessionUser,'ustara_account_test');
});
