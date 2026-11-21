const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenBookingPrivacy}=require('../scripts/v176-seven-booking-privacy-decisions.mjs');
test('v176 audits exactly #144–#150 using original unchanged registry',()=>{
 const a=auditSevenBookingPrivacy();
 assert.deepEqual(a.decisions.map(row=>row.id),[144,145,146,147,148,149,150]);
 assert.equal(a.indexedTotal,151);assert.equal(a.notYetIndexed,34);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(a.productionReady,false);
});
test('v176 does not claim #147–#150 implemented',()=>{
 const a=auditSevenBookingPrivacy();
 assert.equal(a.requirementsNotImplemented,4);
 for(const row of a.decisions.filter(row=>row.id>=147)){
  assert.equal(row.sourceStatus,'NOT_IMPLEMENTED');
  assert.deepEqual(row.code,[]);assert.deepEqual(row.tests,[]);
 }
});
test('v176 booking search and recovery remain partial, not runtime release claims',()=>{
 const a=auditSevenBookingPrivacy();
 assert.equal(a.sourcePartiallyImplemented,3);
 assert.match(a.decisions.find(x=>x.id===145).missingImplementation[0],/already-loaded bookings/);
 assert.equal(a.postgresE2E,'NOT_RUN');assert.equal(a.browserE2E,'NOT_RUN');
 for(const x of a.decisions)assert.equal(x.productionVerified,false);
});
