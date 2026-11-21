'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/v171-seven-barber-team-decisions.mjs');
const run=(args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
test('v171 #109-#115: indexed decision review does not assert completion',()=>{
 const proc=run(['--json']);assert.equal(proc.status,0,proc.stderr);
 const a=JSON.parse(proc.stdout);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.deepEqual(a.decisions.map(x=>x.id),[109,110,111,112,113,114,115]);
 assert.equal(a.indexedTotal,116);assert.equal(a.notYetIndexed,69);
 assert.equal(a.requirementsNotImplemented,6);assert.equal(a.sourceImplemented,1);
 assert.equal(a.productionReady,false);
 assert.ok(a.decisions.every(d=>!d.productionVerified&&d.missingImplementation.length));
});
test('v171 missing team implementation has NO fake source references',()=>{
 const a=JSON.parse(run(['--json']).stdout);
 for(const d of a.decisions.filter(x=>x.id>109)){
  assert.equal(d.sourceStatus,'NOT_IMPLEMENTED');assert.deepEqual(d.code,[]);assert.deepEqual(d.tests,[]);
 }
 assert.equal(run(['--require-production']).status,1);
});
