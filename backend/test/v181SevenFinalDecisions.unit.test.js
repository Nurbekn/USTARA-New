const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {slotCandidates}=require('../services/slotGrid.js');
const {auditSevenFinalDecisions}=require('../scripts/v181-seven-final-decisions.mjs');
test('#179–#185: canonical registry is fully source-reviewed, not production-ready',()=>{
 const result=auditSevenFinalDecisions();
 assert.deepEqual(result.decisions.map(x=>x.id),[179,180,181,182,183,184,185]);
 assert.equal(result.indexedTotal,185);
 assert.equal(result.notYetIndexed,0);
 assert.equal(result.productionReady,false);
 assert.equal(result.postgresE2E,'NOT_RUN');
 assert.equal(result.registrySha256,'bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71');
});
test('#179 private notes are not claimed implemented; #181 #182 remain cancelled',()=>{
 const items=auditSevenFinalDecisions().decisions;
 assert.equal(items[0].sourceStatus,'NOT_IMPLEMENTED');
 assert.deepEqual(items[0].code,[]);
 assert.equal(items[2].sourceStatus,'CANCELLED_BY_USER');
 assert.equal(items[3].sourceStatus,'CANCELLED_BY_USER');
});
test('#180 five-minute slot and duration grid remain validated',()=>{
 assert.throws(()=>slotCandidates({workStart:540,workEnd:600,duration:7,nowMinutes:0}),TypeError);
 const slots=slotCandidates({workStart:540,workEnd:600,duration:15,nowMinutes:0});
 assert.deepEqual(slots.map(x=>x.start),[540,545,550,555,560,565,570,575,580,585]);
 assert.ok(auditSevenFinalDecisions().decisions.find(x=>x.id===180).code.length>0);
});
test('#184 no arbitrary day booking count cuts off eligible slots',()=>{
 const slots=slotCandidates({workStart:540,workEnd:1020,duration:30,nowMinutes:0});
 assert.equal(slots.length,91);
 assert.ok(slots.every(x=>x.available===true));
 const blocked=slotCandidates({workStart:540,workEnd:1020,duration:30,nowMinutes:0,busy:[{start:600,end:660}]});
 assert.equal(blocked.length,91);
 assert.ok(blocked.some(x=>!x.available));
});
test('#185 availability is public, booking creation still requires auth',()=>{
 const route=fs.readFileSync(path.join(__dirname,'../routes/bookings.js'),'utf8');
 assert.match(route,/router\.get\("\/available-slots",getAvailableSlots\)/);
 assert.match(route,/router\.post\("\/", authMiddleware, createBooking\)/);
 assert.ok(auditSevenFinalDecisions().decisions.find(x=>x.id===185).tests.length);
});
