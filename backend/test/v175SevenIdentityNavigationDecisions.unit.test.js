const { test } = require('node:test');
const assert = require('node:assert/strict');
const { auditSevenIdentityNavigation } = require('../scripts/v175-seven-identity-navigation-decisions.mjs');

test('v175 audits exactly #137–#143 against unmodified original registry',()=>{
 const a=auditSevenIdentityNavigation();
 assert.deepEqual(a.decisions.map(x=>x.id),[137,138,139,140,141,142,143]);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(a.indexedTotal,144);assert.equal(a.notYetIndexed,41);
 assert.equal(a.productionReady,false);
});
test('v175 evidence has real checked code and tests, not fictitious statuses',()=>{
 const a=auditSevenIdentityNavigation();
 for(const row of a.decisions){
  assert.equal(row.sourceStatus,'PARTIAL_SOURCE_GAP');
  assert.ok(row.code.length && row.tests.length && row.missingImplementation.length);
  assert.equal(row.productionVerified,false);
 }
 assert.equal(a.postgresE2E,'NOT_RUN');assert.equal(a.browserE2E,'NOT_RUN');
});
test('v175 identity recovery and map links never overclaim completion',()=>{
 const a=auditSevenIdentityNavigation();
 const recovery=a.decisions.find(x=>x.id===140);
 assert.match(recovery.missingImplementation[0],/NOT implemented\/verified/);
 assert.match(a.decisions.find(x=>x.id===141).missingImplementation[0],/E2E/);
});
