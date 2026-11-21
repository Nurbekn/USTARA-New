import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canSelfExitQueue} from '../src/pages/queue/queueExitEligibility.js';
const qr=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
const manual=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
for(const status of ['waiting','called','arrived']){
 test(`v97 ${status} permits customer voluntary queue exit`,()=>{
  assert.equal(canSelfExitQueue(status),true);
 });
}
for(const status of ['in_service','served','missed','left',null,undefined,[],{},'ARRIVED',1]){
 test(`v97 ${String(status)} does not expose voluntary exit action`,()=>{
  assert.equal(canSelfExitQueue(status),false);
 });
}
test('v97 QR renders leave action and closes confirmation when no longer eligible',()=>{
 assert.match(qr,/canSelfExitQueue\(ticket\?\.queue_status\)/);
 assert.match(qr,/canSelfExitQueue\(validated\.queue_status\)/);
 assert.match(qr,/!canSelfExitQueue\(ticket\?\.queue_status\)\)return/);
 assert.match(qr,/statusUnavailable/);
});
test('v97 authenticated manual queue uses same exit policy',()=>{
 assert.match(manual,/canSelfExitQueue\(entry\.status\)/);
 assert.match(manual,/setReadFailed\(true\);setEntries\(\[\]\)/);
});
