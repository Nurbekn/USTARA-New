'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenPhoneDistrictDecisions}=require('../scripts/v178-seven-phone-district-decisions.mjs');
test('v178 covers exactly #158–#164 and keeps the same 185 registry',()=>{
 const a=auditSevenPhoneDistrictDecisions();
 assert.deepEqual(a.decisions.map(d=>d.id),[158,159,160,161,162,163,164]);
 assert.equal(a.indexedTotal,165);assert.equal(a.notYetIndexed,20);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('v178 clearly marks manual phone booking missing and in-service edit cancelled',()=>{
 const a=auditSevenPhoneDistrictDecisions();
 assert.equal(a.decisions[2].sourceStatus,'NOT_IMPLEMENTED');
 assert.deepEqual(a.decisions[2].code,[]);
 assert.equal(a.decisions[5].sourceStatus,'CANCELLED_BY_USER');
 assert.deepEqual(a.decisions[5].tests,[]);
});
test('v178 evidence review never claims production completion',()=>{
 const a=auditSevenPhoneDistrictDecisions();
 assert.equal(a.postgresE2E,'NOT_RUN');assert.equal(a.browserE2E,'NOT_RUN');
 assert.equal(a.productionReady,false);
 assert.ok(a.decisions.every(x=>x.productionVerified===false));
 assert.ok(a.decisions[1].code.length>=3 && a.decisions[6].code.length>=2);
});
