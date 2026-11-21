'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v162-seven-evidence-and-safety-decisions.mjs');
test('v162 seven exact registry source traces are unique and not production complete',()=>{
 const data=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.equal(data.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(data.uniqueSourceTraces,56);assert.equal(data.notYetTraced,129);
 assert.deepEqual(data.decisions.map(d=>d.id),[46,47,48,49,50,51,52]);
 assert.equal(data.productionReady,false);
 for(const decision of data.decisions){assert.equal(decision.sourceStatus,'PARTIAL_SOURCE_GAP');
  assert.equal(decision.productionVerified,false);assert.ok(decision.code.length);assert.ok(decision.tests.length);
  assert.ok(decision.missingImplementation.length);
 }
});
test('v162 production cannot be certified from static source references',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
});
