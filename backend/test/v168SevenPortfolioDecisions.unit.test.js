'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v168-seven-portfolio-decisions.mjs');
test('v168 audits original #88–#94 without certifying production',()=>{
 const r=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.deepEqual(r.decisions.map(d=>d.id),[88,89,90,91,92,93,94]);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(r.previousSourceTraces,89);assert.deepEqual(r.alreadyIndexed,[]);
 assert.equal(r.newSourceTraces,7);assert.equal(r.uniqueSourceTraces,96);
 assert.equal(r.notYetTraced,89);assert.equal(r.productionReady,false);
 assert.ok(r.decisions.every(d=>d.code.length&&d.tests.length&&!d.productionVerified&&d.missingImplementation.length));
});
test('v168 audit refuses --require-production',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{stdio:'pipe'}));
});
