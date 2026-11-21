'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig,verifyV39Migration,TESTS}=require('../scripts/v40-staging');
const good={NODE_ENV:'test',USTARA_V40_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:example@127.0.0.1:5432/ustara_test_db'};
test('v40 staging defaults fail closed before pg import or a connection',()=>{
 for(const env of [{},{...good,NODE_ENV:'production'},{...good,USTARA_V40_STAGING:''},
  {...good,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:secret@db.example.org/ustara_test_db'},
  {...good,USTARA_TEST_DATABASE_URL:'postgres://postgres:secret@127.0.0.1/ustara_test_db'},
  {...good,USTARA_TEST_DATABASE_URL:'postgres://ustara_account_test:secret@127.0.0.1/ustara_prod'}]){
  assert.throws(()=>validateConfig(env));
 }
 const result=validateConfig(good);
 assert.equal(result.target.database,'ustara_test_db');
 assert.equal(result.tests.length,5);
 assert.equal(TESTS.length,5);
});
test('v40 staging migration preflight is read-only and refuses missing schema proof',async()=>{
 let sql;
 const healthy={query:async q=>{sql=q;return q.includes('current_schema()')?
  {rows:[{active_schema:'public',read_only:'on'}]}:{rows:[{migration_recorded:true,constraint_present:true}]};}};
 assert.equal(await verifyV39Migration(healthy),true);
 assert.match(sql,/pg_catalog.pg_constraint/);
 assert.match(sql,/pg_catalog.pg_get_constraintdef/);
 assert.match(sql,/ustara_schema_migrations/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\s+/i);
 await assert.rejects(verifyV39Migration({query:async q=>({rows:[q.includes('current_schema()')?{active_schema:'public',read_only:'on'}:{migration_recorded:true,constraint_present:false}]})}),/migration or valid queue/);
 await assert.rejects(verifyV39Migration({query:async q=>({rows:q.includes('current_schema()')?[{active_schema:'public',read_only:'on'}]:[]})}),/migration or valid queue/);
});
