import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offerActionState} from '../src/pages/queue/manualQueueModel.js';
const now=Date.parse('2026-11-19T08:00:00Z');
test('v45 expired pending offers cannot display accept/reject controls',()=>{
 assert.equal(offerActionState({status:'pending',expires_at:'2026-11-19T07:59:59Z'},now),'expired');
 assert.equal(offerActionState({status:'pending',expires_at:'2026-11-19T08:00:02Z'},now),'pending');
});
test('v45 expired accepted offers cannot display booking confirmation controls',()=>{
 assert.equal(offerActionState({status:'accepted',confirmation_deadline:'2026-11-19T08:00:00Z'},now),'expired');
 assert.equal(offerActionState({status:'accepted',confirmation_deadline:'2026-11-19T08:00:01Z'},now),'accepted');
 assert.equal(offerActionState({status:'rejected'},now),'inactive');
 assert.equal(offerActionState(null,now),'inactive');
});
test('v45 manual UI gates service requests and confirmation by live offer state',()=>{
 const source=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(source,/offerActionState\(offer,Date\.now\(\)\)!=='accepted'/);
 assert.match(source,/offerState==='pending'/);
 assert.match(source,/offerState==='accepted'/);
 assert.match(source,/Taklif muddati tugagan yoki faol emas/);
});
