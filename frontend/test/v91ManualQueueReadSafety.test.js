import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseManualQueueEntries} from '../src/pages/queue/manualQueueReadGuard.js';
const base={id:10,barber_id:3,status:'waiting',queue_position:1,smart_offer:null};
const offer={id:12,status:'pending',starts_at:'2026-11-19T12:00:00.000Z',expires_at:'2026-11-19T12:05:00.000Z'};
for(const wrong of [null,undefined,[],{}, {entries:null}, {entries:{}}, {entries:Array(11).fill(base)}]) {
 test('v91 rejects malformed response '+String(wrong),()=>assert.equal(parseManualQueueEntries(wrong),null));
}
test('v91 empty queue is valid, separate from unavailable',()=>assert.deepEqual(parseManualQueueEntries({entries:[]}),[]));
test('v91 strips private/extra data from valid entries',()=>{
 const got=parseManualQueueEntries({entries:[{...base,phone:'+998000000',admin_secret:'do not show'}],private_note:'none'});
 assert.deepEqual(got,[base]);assert.ok(!JSON.stringify(got).includes('phone'));
});
test('v91 accepts a valid pending offer, strips extras',()=>{
 const got=parseManualQueueEntries({entries:[{...base,smart_offer:{...offer,token:'secret'}}]});
 assert.deepEqual(got[0].smart_offer,{...offer,confirmation_deadline:null});
 assert.ok(!JSON.stringify(got).includes('secret'));
});
test('v91 accepts an accepted offer with confirmation deadline',()=>{
 const got=parseManualQueueEntries({entries:[{...base,smart_offer:{...offer,status:'accepted',confirmation_deadline:offer.expires_at}}]});
 assert.equal(got[0].smart_offer.status,'accepted');
});
for(const delta of [
 {id:0},{id:1.5},{id:'1'},{id:2147483648},{barber_id:'3'},{status:'served'},
 {queue_position:-1},{queue_position:0},{smart_offer:{...offer,id:'12'}},
 {smart_offer:{...offer,status:'accepted',confirmation_deadline:null}},
 {smart_offer:{...offer,starts_at:'not-a-date'}},
 {status:'called',smart_offer:offer},
 ]) {
 test('v91 rejects unsafe queue record '+JSON.stringify(delta),()=>{
  assert.equal(parseManualQueueEntries({entries:[{...base,...delta}]}),null);
 });
}
test('v91 duplicate ticket IDs are rejected, not rendered twice',()=>{
 assert.equal(parseManualQueueEntries({entries:[base,{...base,queue_position:2}]}),null);
});
test('v91 manual UI fails closed after polling error and gives retry action',()=>{
 const s=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(s,/setReadFailed\(true\);setEntries\(\[\]\);setLeaveConfirmId\(null\)/);
 assert.match(s,/if\(busy\|\|readFailed\)return/);
 assert.match(s,/Navbatni qayta tekshirish/);
 assert.match(s,/!loading&&!readFailed&&hasAccount&&entries\.length===0/);
});
test('v91 QR status error hides the previous active ticket and leaves retry available',()=>{
 const s=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 assert.match(s,/setStatusUnavailable\(true\);setTicket\(null\)/);
 assert.match(s,/!statusUnavailable&&status==='approved'/);
 assert.match(s,/queue_result_unknown/);
 assert.match(s,/!!status&&!statusUnavailable/);
});
