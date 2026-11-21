'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v163-seven-availability-and-experience-decisions.mjs');
test('v163 original decision registry #53–#59 has seven unique evidence traces, not production acceptance',()=>{
 const result=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.equal(result.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(result.previousSourceTraces,56);
 assert.equal(result.uniqueSourceTraces,63);
 assert.equal(result.notYetTraced,122);
 assert.deepEqual(result.decisions.map(d=>d.id),[53,54,55,56,57,58,59]);
 assert.equal(result.productionReady,false);
 for(const item of result.decisions){
  assert.equal(item.productionVerified,false);
  assert.equal(item.sourceStatus,'PARTIAL_SOURCE_GAP');
  assert.ok(item.code.length&&item.tests.length&&item.missingImplementation.length);
 }
});
test('v163 static audit cannot pass as real production verification',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
});
