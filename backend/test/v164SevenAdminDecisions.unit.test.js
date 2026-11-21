'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v164-seven-admin-navigation-decisions.mjs');
test('v164 original registry decisions #60–#66 provide seven unique static traces, not runtime proof',()=>{
 const result=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.equal(result.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(result.previousSourceTraces,63);assert.equal(result.uniqueSourceTraces,70);assert.equal(result.notYetTraced,115);
 assert.deepEqual(result.decisions.map(x=>x.id),[60,61,62,63,64,65,66]);
 assert.equal(result.productionReady,false);
 for(const item of result.decisions){assert.equal(item.sourceStatus,'PARTIAL_SOURCE_GAP');assert.equal(item.productionVerified,false);assert.ok(item.code.length&&item.tests.length&&item.missingImplementation.length);}
});
test('v164 static audit cannot be promoted to production readiness',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{stdio:['ignore','pipe','pipe']}));
});
