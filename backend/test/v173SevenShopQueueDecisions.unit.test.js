const test=require('node:test');
const assert=require('node:assert/strict');
const {auditSevenShopQueue}=require('../scripts/v173-seven-shop-queue-decisions.mjs');
test('v173 audit reviews exactly seven original decisions with 130 unique total',()=>{
 const a=auditSevenShopQueue();assert.equal(a.indexedTotal,130);assert.equal(a.notYetIndexed,55);
 assert.deepEqual(a.decisions.map(x=>x.id),[123,124,125,126,127,128,129]);
 assert.equal(a.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
 assert.equal(a.productionReady,false);
});
test('v173 does not invent shop promotions, salon ratings or shared queue',()=>{
 const a=auditSevenShopQueue();
 for(const id of [123,125]){const r=a.decisions.find(x=>x.id===id);assert.equal(r.sourceStatus,'NOT_IMPLEMENTED');assert.deepEqual(r.code,[]);}
 for(const id of [124,126,127,128,129]){const r=a.decisions.find(x=>x.id===id);assert.equal(r.sourceStatus,'PARTIAL_SOURCE_GAP');assert.ok(r.missingImplementation[0]);assert.equal(r.productionVerified,false);}
});
