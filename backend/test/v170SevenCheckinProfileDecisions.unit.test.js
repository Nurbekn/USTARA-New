'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v170-seven-checkin-profile-decisions.mjs');
test('v170 audits seven decisions and does not count #107 a second time',()=>{
 const data=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.deepEqual(data.decisions.map(d=>d.id),[102,103,104,105,106,107,108]);
 assert.equal(data.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.deepEqual(data.alreadyIndexed,[107]);
 assert.equal(data.newSourceTraces,6);
 assert.equal(data.uniqueSourceTraces,109);
 assert.equal(data.notYetTraced,76);
 assert.equal(data.productionReady,false);
 assert.ok(data.decisions.every(d=>d.code.length&&d.tests.length&&!d.productionVerified&&d.missingImplementation.length));
});
test('v170 #108 clearly remains unimplemented, and production promotion is blocked',()=>{
 const data=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.equal(data.decisions.find(d=>d.id===108).sourceStatus,'NOT_IMPLEMENTED');
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{stdio:'pipe'}));
});
