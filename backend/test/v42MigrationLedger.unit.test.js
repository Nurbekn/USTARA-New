'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {expectedMigrationVersions,verifyMigrationLedger,validateConfig,verifyV39Migration}=require('../scripts/v40-staging');
const names=expectedMigrationVersions();
const makeClient=versions=>({query:async sql=>{
 assert.match(sql,/^SELECT version FROM ustara_schema_migrations ORDER BY version$/);
 assert.doesNotMatch(sql,/\bINSERT\b|\bDELETE\b|\bUPDATE\b/i);
 return {rows:versions.map(version=>({version}))};
}});
test('v42 migration ledger compares all 63 versions against committed bootstrap files',async()=>{
 assert.equal(names.length,63);
 assert.equal(new Set(names).size,63);
 assert.equal(await verifyMigrationLedger(makeClient([...names].sort())),true);
});
test('v42 migration ledger refuses missing, unexpected, duplicate or malformed migration',async()=>{
 for(const bad of [names.slice(1),[...names.slice(1),'fake_migration'],
  [...names.slice(0,-1),names[0]],names.map((v,i)=>i===0?null:v)]){
  await assert.rejects(verifyMigrationLedger(makeClient(bad.sort())),/migration ledger/);
 }
 await assert.rejects(verifyMigrationLedger(makeClient([...names].sort()),['one']),/63 unique/);
});
test('v42 ledger remains test-only and explicit opt-in required before a PostgreSQL connection',()=>{
 assert.throws(()=>validateConfig({NODE_ENV:'production',USTARA_V40_STAGING:'I_AUTHORIZE_LOCAL_STAGING',
 USTARA_TEST_DATABASE_URL:'postgresql://ustara_account_test:secret@127.0.0.1:5442/ustara_test_db'}));
});
