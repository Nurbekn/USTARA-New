'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const script=path.resolve(__dirname,'../scripts/v169-seven-customer-booking-decisions.mjs');
test('v169 indexes original #95–#101 and does not certify production',()=>{
 const data=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.deepEqual(data.decisions.map(row=>row.id),[95,96,97,98,99,100,101]);
 assert.equal(data.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(data.previousSourceTraces,96);assert.equal(data.uniqueSourceTraces,96+data.newSourceTraces);
 assert.equal(data.productionReady,false);assert.ok(data.decisions.every(row=>row.code.length&&row.tests.length&&!row.productionVerified&&row.missingImplementation.length));
});
test('v169 source audit refuses production promotion',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{stdio:'pipe'}));
});
