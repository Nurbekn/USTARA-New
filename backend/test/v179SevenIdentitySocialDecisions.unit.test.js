'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenIdentitySocialDecisions}=require('../scripts/v179-seven-identity-social-decisions.mjs');
test('v179 audits exactly #165–#171 against unchanged canonical registry',()=>{
 const result=auditSevenIdentitySocialDecisions();
 assert.deepEqual(result.decisions.map(d=>d.id),[165,166,167,168,169,170,171]);
 assert.equal(result.indexedTotal,172);assert.equal(result.notYetIndexed,13);
 assert.equal(result.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v179 preserves both explicitly cancelled workflows',()=>{
 const decisions=auditSevenIdentitySocialDecisions().decisions;
 for(const id of [167,170]){
  const decision=decisions.find(x=>x.id===id);
  assert.equal(decision.sourceStatus,'CANCELLED_BY_USER');
  assert.deepEqual(decision.code,[]);
 }
});
test('v179 author credit evidence exists without false production verification',()=>{
 const result=auditSevenIdentitySocialDecisions();
 const gallery=result.decisions.find(x=>x.id===171);
 assert.ok(gallery.code.length>=2&&gallery.tests.length>=2);
 assert.equal(result.productionReady,false);
 assert.equal(result.postgresE2E,'NOT_RUN');
 assert.ok(result.decisions.every(x=>x.productionVerified===false));
});
