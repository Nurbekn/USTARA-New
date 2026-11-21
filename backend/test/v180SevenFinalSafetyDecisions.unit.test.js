const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenFinalSafetyDecisions}=require('../scripts/v180-seven-final-safety-decisions.mjs');
test('v180 audits #172–#178 against the same canonical 185-decision registry',()=>{
 const result=auditSevenFinalSafetyDecisions();
 assert.deepEqual(result.decisions.map(d=>d.id),[172,173,174,175,176,177,178]);
 assert.equal(result.indexedTotal,179);assert.equal(result.notYetIndexed,6);
 assert.equal(result.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v180 #172 stays cancelled; #175 #176 #177 remain unimplemented',()=>{
 const decisions=auditSevenFinalSafetyDecisions().decisions;
 assert.equal(decisions.find(x=>x.id===172).sourceStatus,'CANCELLED_BY_USER');
 for(const id of [175,176,177]){
  const item=decisions.find(x=>x.id===id);
  assert.equal(item.sourceStatus,'NOT_IMPLEMENTED');
  assert.deepEqual(item.code,[]);
 }
});
test('v180 #178 has concrete frontend and backend evidence without pretending live integration tests',()=>{
 const report=auditSevenFinalSafetyDecisions();
 const item=report.decisions.find(x=>x.id===178);
 assert.ok(item.code.length>=3 && item.tests.length>=2);
 assert.equal(report.productionReady,false);
 assert.equal(report.postgresE2E,'NOT_RUN');
 assert.ok(report.decisions.every(x=>x.productionVerified===false));
});
