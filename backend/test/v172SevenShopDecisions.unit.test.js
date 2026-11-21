const test=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenShops}=require('../scripts/v172-seven-shop-decisions.mjs');
test('v172 original 185 registry remains intact and 116+7 review coverage is unique',()=>{
 const r=auditSevenShops();assert.equal(r.totalDecisions,185);assert.equal(r.indexedTotal,123);
 assert.deepEqual(r.decisions.map(d=>d.id),[116,117,118,119,120,121,122]);
 assert.equal(r.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(r.productionReady,false);assert.equal(r.requirementsNotImplemented,4);
 assert.equal(r.sourcePartiallyImplemented,3);
});
test('v172 source inventory does not invent a completed multi-staff shop system',()=>{
 const r=auditSevenShops();for(const id of [116,117,118,122]){
  const row=r.decisions.find(d=>d.id===id);assert.equal(row.sourceStatus,'NOT_IMPLEMENTED');
  assert.deepEqual(row.code,[]);assert.deepEqual(row.tests,[]);
 }
 for(const id of [119,120,121]){const d=r.decisions.find(v=>v.id===id);assert.equal(d.productionVerified,false);assert.ok(d.missingImplementation[0]);}
});
