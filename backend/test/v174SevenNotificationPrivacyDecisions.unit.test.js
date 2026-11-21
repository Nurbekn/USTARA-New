const test=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenNotificationPrivacy}=require('../scripts/v174-seven-notification-privacy-decisions.mjs');
test('v174 audits seven original requirements without renaming registry',()=>{
 const a=auditSevenNotificationPrivacy();
 assert.deepEqual(a.decisions.map(x=>x.id),[130,131,132,133,134,135,136]);
 assert.equal(a.indexedTotal,137);assert.equal(a.notYetIndexed,48);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(a.productionReady,false);
});
test('v174 does not claim cross-barber transfer or privacy center exists',()=>{
 const a=auditSevenNotificationPrivacy();
 for (const id of [130,134]) {
  const row=a.decisions.find(x=>x.id===id);
  assert.equal(row.sourceStatus,'NOT_IMPLEMENTED');
  assert.deepEqual(row.code,[]);
 }
 for (const id of [131,132,133,135,136]) {
  const row=a.decisions.find(x=>x.id===id);
  assert.equal(row.sourceStatus,'PARTIAL_SOURCE_GAP');
  assert.ok(row.code.length&&row.tests.length&&row.missingImplementation.length);
  assert.equal(row.productionVerified,false);
 }
});
