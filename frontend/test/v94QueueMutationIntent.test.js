import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callNextIntent,finishIntent} from '../src/pages/barber/data/queueMutationIntentV94.js';
const item=(id,status='waiting')=>({id,status});
test('v94 matches observed first waiting ticket without exposing label',()=>{
  assert.deepEqual(callNextIntent(null,[{...item('15'),display_label:'private'},item(20)]),{expected_next_id:15});
});
test('v94 refuses a next-call while another ticket is already called',()=>{
  assert.equal(callNextIntent(item(3,'called'),[item(15)]),null);
});
test('v94 empty and malformed waiting snapshots do not create intent',()=>{
  for(const bad of [undefined,null,[],{},'bad'])assert.equal(callNextIntent(null,bad),null);
});
for(const bad of [0,-1,1.5,'0','01','0x10','1e2','9007199254740992',{},null]){
 test('v94 rejects invalid observed head '+String(bad),()=>assert.equal(callNextIntent(null,[item(bad)]),null));
}
test('v94 accepts canonical numeric and decimal-string IDs',()=>{
  assert.deepEqual(callNextIntent(null,[item(15)]),{expected_next_id:15});
  assert.deepEqual(callNextIntent(null,[item('2147483648')]),{expected_next_id:2147483648});
});
for(const status of ['served','missed','left']){
 test('v94 called ticket can finish as '+status,()=>{
  assert.deepEqual(finishIntent(item('5','called'),status),{id:5,body:{status,expected_status:'called'}});
 });
}
test('v94 waiting ticket may exit only as left',()=>{
  assert.deepEqual(finishIntent(item(5,'waiting'),'left'),{id:5,body:{status:'left',expected_status:'waiting'}});
  for(const status of ['served','missed','called'])assert.equal(finishIntent(item(5,'waiting'),status),null);
});
test('v94 already-terminal and malformed tickets cannot be finished again in UI',()=>{
  for(const status of ['served','left','missed','invalid'])assert.equal(finishIntent(item(5,status),'left'),null);
  assert.equal(finishIntent(item('01','called'),'served'),null);
});
test('v94 Queue UI passes optimistic preconditions on calls and finish requests',()=>{
  const file=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
  assert.match(file,/callNextIntent\(called,waiting\)/);
  assert.match(file,/action\('\/api\/queue\/call-next',intent\)/);
  assert.match(file,/finishIntent\(entry,status\)/);
  assert.match(file,/body:intent\.body/);
  assert.doesNotMatch(file,/finish\(called\.id/);
});
