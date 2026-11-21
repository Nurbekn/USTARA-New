'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v167-seven-social-security-decisions.mjs');
test('v167 seven exact #81–#87 decisions map to unchanged registry without duplicate index claims',()=>{
 const value=JSON.parse(execFileSync(process.execPath,[script,'--json'],{encoding:'utf8'}));
 assert.equal(value.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.deepEqual(value.decisions.map(x=>x.id),[81,82,83,84,85,86,87]);
 assert.deepEqual(value.alreadyIndexed,[]);
 assert.equal(value.reviewedDecisions,7);assert.equal(value.previousSourceTraces,82);
 assert.equal(value.newSourceTraces,7);assert.equal(value.uniqueSourceTraces,89);assert.equal(value.notYetTraced,96);
 assert.equal(value.postgresE2E,'NOT_RUN');assert.equal(value.offlineBarberSync,'NOT_IMPLEMENTED');
 assert.equal(value.smartClientCard,'NOT_IMPLEMENTED');assert.equal(value.productionReady,false);
 assert.ok(value.decisions.every(x=>x.productionVerified===false && x.code.length && x.tests.length && x.missingImplementation.length));
});
test('v167 audit cannot be used to certify production release',()=>{
 assert.throws(()=>execFileSync(process.execPath,[script,'--require-production'],{encoding:'utf8',stdio:'pipe'}));
});
