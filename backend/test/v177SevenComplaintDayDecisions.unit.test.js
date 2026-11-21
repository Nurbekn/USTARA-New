const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenComplaintDayDecisions}=require('../scripts/v177-seven-complaint-day-decisions.mjs');
test('v177 reviews #151–#157 exactly and preserves original registry hash',()=>{
 const a=auditSevenComplaintDayDecisions();
 assert.deepEqual(a.decisions.map(x=>x.id),[151,152,153,154,155,156,157]);
 assert.equal(a.indexedTotal,158);assert.equal(a.notYetIndexed,27);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v177 marks missing manager permission and cancelled relocation honestly',()=>{
 const a=auditSevenComplaintDayDecisions();
 assert.equal(a.decisions[4].sourceStatus,'NOT_IMPLEMENTED');
 assert.deepEqual(a.decisions[4].code,[]);
 assert.equal(a.decisions[5].sourceStatus,'CANCELLED_BY_USER');
 assert.deepEqual(a.decisions[5].tests,[]);
 assert.equal(a.explicitlyCancelled,1);
});
test('v177 receipts do not pretend moderator review or production readiness',()=>{
 const a=auditSevenComplaintDayDecisions();
 assert.equal(a.postgresE2E,'NOT_RUN');assert.equal(a.browserE2E,'NOT_RUN');
 assert.equal(a.productionReady,false);
 assert.ok(a.decisions.every(x=>x.productionVerified===false));
 assert.match(a.decisions[0].missingImplementation[0],/NOT a moderation outcome/);
});
