'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {slotCandidates,STEP_MINUTES}=require('../services/slotGrid');

test('starts always align with five-minute boundaries even for old 09:03 schedules',()=>{
  const slots=slotCandidates({workStart:9*60+3,workEnd:9*60+38,duration:15,nowMinutes:0});
  assert.deepEqual(slots.map(({start,end})=>[start,end]),[[545,560],[550,565],[555,570],[560,575]]);
  assert.ok(slots.every(s=>s.start%STEP_MINUTES===0));
});
test('busy overlap, past times and touching boundary are handled consistently',()=>{
  const candidates=slotCandidates({workStart:540,workEnd:600,duration:15,nowMinutes:545,
    busy:[{start:560,end:580}]});
  const read=t=>candidates.find(s=>s.start===t);
  assert.equal(read(540).available,false); // at or before now
  assert.equal(read(545).available,false);
  assert.equal(read(550).available,false); // 09:10-09:25 intersects a booking at 09:20
  assert.equal(read(565).available,false);
  assert.equal(read(580).available,true); // 09:40 begins when the old interval ends
});
test('last slot fits whole service and invalid minutes do not create misleading slots',()=>{
  const s=slotCandidates({workStart:600,workEnd:645,duration:30,nowMinutes:0});
  assert.deepEqual(s.map(({start,end})=>[start,end]),[[600,630],[605,635],[610,640],[615,645]]);
  for(const duration of [0,14,Infinity,2.5])assert.throws(()=>slotCandidates({workStart:600,workEnd:645,duration,nowMinutes:0}),TypeError);
  assert.throws(()=>slotCandidates({workStart:600,workEnd:645,duration:30,nowMinutes:0,busy:[{start:650,end:640}]}),TypeError);
});
