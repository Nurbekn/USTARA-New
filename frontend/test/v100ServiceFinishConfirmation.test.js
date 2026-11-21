import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SERVICE_FINISH_CONFIRM_MAX_AGE_MS,
  createServiceFinishConfirmation,
  confirmServiceFinish,
  keepServiceFinishConfirmation,
} from '../src/pages/barber/data/serviceFinishConfirmationV100.js';

const now=1750000000000;
const barber={role:'barber',token:'barber-a'};
const queue=(id=23,status='in_service')=>({id,status,display_label:'Mijoz telefoni'});
const pending=()=>createServiceFinishConfirmation(queue(),barber,4,now);

test('v100 service finish uses a dedicated explicit confirmation',()=>{
  assert.deepEqual(pending(),{id:23,status:'in_service',token:'barber-a',epoch:4,createdAt:now});
});
test('v100 accepts canonical decimal string IDs without leaking display names',()=>{
  assert.deepEqual(createServiceFinishConfirmation(queue('23'),barber,4,now),pending());
  assert.equal('display_label' in pending(),false);
});
for(const id of [0,-1,NaN,Infinity,1.5,'0','01','0x17','2.3','9007199254740992',null,{},[]]){
  test('v100 rejects malformed or unsafe queue ID '+String(id),()=>{
    assert.equal(createServiceFinishConfirmation(queue(id),barber,4,now),null);
  });
}
for(const status of ['waiting','called','arrived','served','missed','left',undefined,'invalid']){
  test('v100 confirmation not offered from status '+String(status),()=>{
    assert.equal(createServiceFinishConfirmation({...queue(),status},barber,4,now),null);
  });
}
test('v100 only a signed-in barber with nonempty token may confirm',()=>{
  for(const session of [null,{}, {role:'customer',token:'barber-a'},
    {role:'barber',token:''},{role:'barber',token:9}]){
    assert.equal(createServiceFinishConfirmation(queue(),session,4,now),null);
  }
});
test('v100 rejects invalid session epochs and invalid confirmation timestamps',()=>{
  for(const epoch of [-1,1.4,NaN,'4',null])assert.equal(createServiceFinishConfirmation(queue(),barber,epoch,now),null);
  for(const time of [-1,Infinity,NaN])assert.equal(createServiceFinishConfirmation(queue(),barber,4,time),null);
});
test('v100 yes returns optimistic finish intent, no extra private fields',()=>{
  assert.deepEqual(confirmServiceFinish(pending(),queue(),barber,4,now+150),{
    id:23,body:{status:'served',expected_status:'in_service'},
  });
});
test('v100 no pending confirmation never sends an API mutation',()=>{
  assert.equal(confirmServiceFinish(null,queue(),barber,4,now),null);
});
test('v100 mismatched account and role cannot reuse old confirmation',()=>{
  assert.equal(confirmServiceFinish(pending(),queue(),{role:'barber',token:'barber-b'},4,now),null);
  assert.equal(confirmServiceFinish(pending(),queue(),{role:'customer',token:'barber-a'},4,now),null);
});
test('v100 account epoch switches invalidate open confirmation',()=>{
  assert.equal(confirmServiceFinish(pending(),queue(),barber,5,now),null);
});
test('v100 queue ID or status change invalidates open confirmation',()=>{
  for(const entry of [queue(24),queue(23,'served'),queue(23,'called'),null,{},queue('023')]){
    assert.equal(confirmServiceFinish(pending(),entry,barber,4,now),null);
  }
});
test('v100 future timestamps cannot be confirmed',()=>{
  assert.equal(confirmServiceFinish(pending(),queue(),barber,4,now-1),null);
});
test('v100 confirmation expires at the 30-second boundary',()=>{
  assert.equal(SERVICE_FINISH_CONFIRM_MAX_AGE_MS,30000);
  assert.ok(confirmServiceFinish(pending(),queue(),barber,4,now+30000));
  assert.equal(confirmServiceFinish(pending(),queue(),barber,4,now+30001),null);
});
test('v100 bogus result timestamps do not confirm the service',()=>{
  for(const time of [NaN,Infinity])assert.equal(confirmServiceFinish(pending(),queue(),barber,4,time),null);
});
test('v100 keeps open prompt only if refreshed snapshot still has same in-service ticket',()=>{
  assert.deepEqual(keepServiceFinishConfirmation(pending(),[queue(12,'waiting'),queue('23')]),pending());
  for(const active of [[],null,{},[queue(23,'served')],[queue(24,'in_service')]]){
    assert.equal(keepServiceFinishConfirmation(pending(),active),null);
  }
  assert.equal(keepServiceFinishConfirmation(null,[queue()]),null);
});
test('v100 UI asks before submitting the service-completed mutation',()=>{
  const src=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
  assert.match(src,/onClick=\{\(\)=>askFinishConfirmation\(called\)\}>\{tr\("Xizmat tugadi"\)\}/);
  assert.doesNotMatch(src,/onClick=\{\(\)=>void finish\(called,'served'\)\}/);
  assert.match(src,/Ha, tugadi/);assert.match(src,/Yo‘q, qaytish/);
  assert.match(src,/confirmServiceFinish\(finishConfirmation,entry,getSession\(\),sessionEpoch\)/);
  assert.match(src,/await finish\(entry,'served'\)/);
  assert.match(src,/setFinishConfirmation\(null\)/);
  assert.match(src,/role="group" aria-label=\{tr\("Xizmatni yakunlash tasdig‘i"\)\}/);
});
test('v100 failed refresh and account switch clear old confirmations',()=>{
  const src=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
  assert.match(src,/setReadFailed\(true\);setFinishConfirmation\(null\);/);
  assert.match(src,/setFinishConfirmation\(current=>keepServiceFinishConfirmation\(current,parsed.active\)\)/);
  assert.match(src,/actionLock.current=true;readGate.current.invalidate\(\);setFinishConfirmation\(null\);/);
});
test('v100 avoids misleading completion actions on previous-day tickets',()=>{
  const src=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
  assert.match(src,/Ularni bugungi navbat tugmasi bilan yakunlab bo‘lmaydi/);
  assert.doesNotMatch(src,/onClick=\{\(\)=>void finish\(entry,'left'\)\}>Yakunlash/);
});
