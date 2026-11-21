import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  NO_SHOW_CONFIRM_MAX_AGE_MS,
  createNoShowConfirmation,
  confirmNoShow,
  keepNoShowConfirmation,
} from '../src/pages/barber/data/noShowConfirmationV105.js';

const now=1750000000000;
const barber={role:'barber',token:'session-a'};
const ticket=(id=21,status='called')=>({
  id,status,queue_date:'2026-11-20',called_at:'2026-11-20T07:10:00.000Z',
  display_label:'Guest #sensitive',created_at:'2026-11-20T06:00:00.000Z',
});
const pending=()=>createNoShowConfirmation(ticket(),barber,5,now);
const ui=()=>readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');

test('v105: only the currently called entry can open a no-show confirmation',()=>{
  assert.deepEqual(pending(),{
    id:21,status:'called',queueDate:'2026-11-20',calledAt:'2026-11-20T07:10:00.000Z',
    token:'session-a',epoch:5,createdAt:now,
  });
});
test('v105: pending holds no display name, private customer details or QR secrets',()=>{
  const prompt=pending();
  for(const key of ['display_label','customer_phone','created_at','qr_token','request_id'])
    assert.equal(Object.hasOwn(prompt,key),false);
});
test('v105: canonical positive numeric-string queue ID is supported',()=>{
  assert.deepEqual(createNoShowConfirmation(ticket('21'),barber,5,now),pending());
});
for(const value of [null,undefined,0,-2,1.5,NaN,Infinity,'0','01','0x15','1e2','9007199254740992',{},[]]){
  test(`v105: no-show refuses invalid ticket ID ${String(value)}`,()=>{
    assert.equal(createNoShowConfirmation({...ticket(),id:value},barber,5,now),null);
  });
}
for(const status of ['waiting','arrived','in_service','served','missed','left',undefined]){
  test(`v105: no-show cannot be requested from ${String(status)} state`,()=>{
    assert.equal(createNoShowConfirmation({...ticket(),status},barber,5,now),null);
  });
}
test('v105: only authenticated barber sessions may start',()=>{
  for(const account of [null,{}, {role:'customer',token:'session-a'},{role:'barber',token:''},{role:'barber',token:7}]){
    assert.equal(createNoShowConfirmation(ticket(),account,5,now),null);
  }
});
test('v105: requires canonical queue date and unambiguous call timestamp',()=>{
  for(const queue_date of [null,'2026-02-30','2026-13-01','2026-11-20T00:00:00Z','x']){
    assert.equal(createNoShowConfirmation({...ticket(),queue_date},barber,5,now),null);
  }
  for(const called_at of [null,'invalid','2026-11-20T07:00:00','2026-11-20T26:00:00Z',Infinity,{}]){
    assert.equal(createNoShowConfirmation({...ticket(),called_at},barber,5,now),null);
  }
});
test('v105: invalid epoch or clock cannot open confirmation',()=>{
  for(const epoch of [-1,NaN,1.4,'5',null])assert.equal(createNoShowConfirmation(ticket(),barber,epoch,now),null);
  for(const time of [NaN,Infinity,-1])assert.equal(createNoShowConfirmation(ticket(),barber,5,time),null);
});
test('v105: a verified YES yields only the optimistic missed-status intent',()=>{
  assert.deepEqual(confirmNoShow(pending(),ticket(),barber,5,now+100),{
    id:21,body:{status:'missed',expected_status:'called'},
  });
});
test('v105: NO or missing confirmation never allows the mutation',()=>{
  assert.equal(confirmNoShow(null,ticket(),barber,5,now),null);
});
test('v105: pending cannot be replayed by another account or role',()=>{
  assert.equal(confirmNoShow(pending(),ticket(),{role:'barber',token:'session-b'},5,now),null);
  assert.equal(confirmNoShow(pending(),ticket(),{role:'customer',token:'session-a'},5,now),null);
  assert.equal(confirmNoShow(pending(),ticket(),null,5,now),null);
});
test('v105: pending belongs to a single session epoch',()=>{
  assert.equal(confirmNoShow(pending(),ticket(),barber,6,now),null);
});
test('v105: pending becomes stale if ticket or status changes',()=>{
  for(const entry of [ticket(22),ticket(21,'arrived'),ticket(21,'in_service'),ticket(21,'served'),null,{}]){
    assert.equal(confirmNoShow(pending(),entry,barber,5,now),null);
  }
});
test('v105: re-call timestamp or queue day change invalidates old approval',()=>{
  assert.equal(confirmNoShow(pending(),{...ticket(),called_at:'2026-11-20T07:12:00Z'},barber,5,now),null);
  assert.equal(confirmNoShow(pending(),{...ticket(),queue_date:'2026-11-21'},barber,5,now),null);
});
test('v105: pending is bounded to 30 seconds, cannot be confirmed in the past',()=>{
  assert.equal(NO_SHOW_CONFIRM_MAX_AGE_MS,30000);
  assert.ok(confirmNoShow(pending(),ticket(),barber,5,now+30000));
  for(const clock of [now-1,now+30001,NaN,Infinity])assert.equal(confirmNoShow(pending(),ticket(),barber,5,clock),null);
});
test('v105: after refresh, retain only matching called entry',()=>{
  assert.deepEqual(keepNoShowConfirmation(pending(),[ticket(9,'waiting'),ticket('21')]),pending());
  for(const rows of [null,{},[],[ticket(21,'arrived')],[ticket(24)],[{...ticket(),called_at:'2026-11-20T09:00:00Z'}]]){
    assert.equal(keepNoShowConfirmation(pending(),rows),null);
  }
  assert.equal(keepNoShowConfirmation(null,[ticket()]),null);
});
test('v105: UI uses explicit yes/no, never submits no-show directly on first click',()=>{
  const src=ui();
  assert.match(src,/onClick=\{\(\)=>askNoShowConfirmation\(called\)\}>\{tr\("Kelmadi"\)\}/);
  assert.doesNotMatch(src,/onClick=\{\(\)=>void finish\(called,'missed'\)\}/);
  assert.match(src,/aria-label=\{tr\("Kelmadi holatini tasdiqlash"\)\}/);
  assert.match(src,/Ha, kelmadi/);assert.match(src,/Yo‘q, qaytish/);
  assert.match(src,/confirmNoShow\(noShowConfirmation,entry,getSession\(\),sessionEpoch\)/);
  assert.match(src,/await finish\(entry,'missed'\)/);
});
test('v105: account switch, stale refresh and action lock invalidate confirmation',()=>{
  const src=ui();
  assert.match(src,/setReadFailed\(true\);setFinishConfirmation\(null\);setNoShowConfirmation\(null\);/);
  assert.match(src,/setNoShowConfirmation\(current=>keepNoShowConfirmation\(current,parsed.active\)\)/);
  assert.match(src,/actionLock.current=true;readGate.current.invalidate\(\);setFinishConfirmation\(null\);setNoShowConfirmation\(null\);/);
  assert.match(src,/if\(!intent\|\|!readyRef.current\|\|readFailed\|\|loading\|\|busy\|\|actionLock.current\)/);
});
