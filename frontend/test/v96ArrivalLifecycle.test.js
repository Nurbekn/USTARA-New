import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callNextIntent,finishIntent,markArrivedIntent,startServiceIntent} from '../src/pages/barber/data/queueMutationIntentV94.js';
import {classifyQueue} from '../src/pages/barber/data/queueModel.js';
import {parseBarberQueueSnapshot} from '../src/pages/barber/data/barberQueueReadGuardV93.js';
import {parseQrQueueStatus} from '../src/pages/queue/qrStatusReadGuard.js';
import {parseManualQueueEntries} from '../src/pages/queue/manualQueueReadGuard.js';
import {statusLabel,isActiveTicket} from '../src/pages/queue/qrModel.js';
const stamp='2026-11-19T10:00:00.000Z';
const item=(status='arrived',extra={})=>({id:'18',display_label:'Mehmon',queue_date:'2026-11-19',status,
 queue_position:1,created_at:stamp,called_at:stamp,arrived_at:status==='arrived'||status==='in_service'?stamp:null,
 started_at:status==='in_service'?stamp:null,finished_at:null,...extra});
const read=entry=>parseBarberQueueSnapshot({active:[entry],recent:[]},{pending:[]},{openings:[]});
test('v96 called ticket has dedicated arrival intent',()=>{
 assert.deepEqual(markArrivedIntent({id:'18',status:'called'}),{id:18,body:{expected_status:'called'}});
 assert.equal(markArrivedIntent({id:18,status:'arrived'}),null);
});
for(const bad of [null,0,-7,'0','01','1e2','0x10','9007199254740992',[],{},1.3]){
 test('v96 invalid ID cannot reach arrival mutation '+String(bad),()=>{
  assert.equal(markArrivedIntent({id:bad,status:'called'}),null);
 });
}
test('v96 new UI starts from arrived while legacy client intent remains valid',()=>{
 assert.deepEqual(startServiceIntent({id:'18',status:'arrived'}),{id:18,body:{expected_status:'arrived'}});
 assert.deepEqual(startServiceIntent({id:'18',status:'called'}),{id:18,body:{expected_status:'called'}});
 assert.equal(startServiceIntent({id:18,status:'waiting'}),null);
});
test('v96 arrived cannot be marked missed or served before service',()=>{
 assert.deepEqual(finishIntent({id:18,status:'arrived'},'left'),{id:18,body:{status:'left',expected_status:'arrived'}});
 assert.equal(finishIntent({id:18,status:'arrived'},'missed'),null);
 assert.equal(finishIntent({id:18,status:'arrived'},'served'),null);
});
test('v96 arrived ticket blocks next call and is active in daily list',()=>{
 const model=classifyQueue([item('arrived'),item('waiting',{id:19,called_at:null,arrived_at:null})],'2026-11-19');
 assert.equal(model.called.status,'arrived');assert.equal(callNextIntent(model.called,model.waiting),null);
});
test('v96 verified arrival snapshot retains timestamp but drops private extras',()=>{
 const out=read({...item(),phone:'+998991234567',token:'private'});
 assert.equal(out.active[0].arrived_at,stamp);
 assert.equal('phone' in out.active[0],false);assert.equal('token' in out.active[0],false);
});
for(const extra of [{called_at:null},{arrived_at:null},{started_at:stamp},{finished_at:stamp}]){
 test('v96 invalid arrived snapshot is rejected '+JSON.stringify(extra),()=>{
  assert.equal(read(item('arrived',extra)),null);
 });
}
test('v96 waiting and called cannot falsely claim arrival timestamp',()=>{
 assert.equal(read(item('called',{arrived_at:stamp})),null);
 assert.equal(read(item('waiting',{called_at:null,arrived_at:stamp})),null);
});
test('v96 QR parser accepts own arrived status and drops unknown fields',()=>{
 const out=parseQrQueueStatus({status:'approved',queue_status:'arrived',position:null,
  estimated_wait:null,telegram_linked:false,offers_enabled:false,smart_offer:null,phone:'hidden'});
 assert.deepEqual(out,{status:'approved',queue_status:'arrived',position:null,
  estimated_wait:null,telegram_linked:false,offers_enabled:false,smart_offer:null});
 assert.equal(isActiveTicket('approved','arrived'),true);
 assert.match(statusLabel('approved','arrived'),/Kelganingiz tasdiqlandi/);
});
test('v96 arrived QR cannot show waiting position or offer',()=>{
 const base={status:'approved',queue_status:'arrived',position:null,estimated_wait:null,
  telegram_linked:false,offers_enabled:false,smart_offer:null};
 assert.equal(parseQrQueueStatus({...base,position:3}),null);
 assert.equal(parseQrQueueStatus({...base,smart_offer:{id:1}}),null);
});
test('v96 linked manual ticket accepts arrived without active smart offer',()=>{
 const out=parseManualQueueEntries({entries:[{id:18,barber_id:7,status:'arrived',queue_position:1,smart_offer:null}]});
 assert.equal(out[0].status,'arrived');
 assert.equal(parseManualQueueEntries({entries:[{id:18,barber_id:7,status:'arrived',queue_position:1,smart_offer:{id:5}}]}),null);
});
test('v96 staff UI has separate check-in button and only shows start after arrived',()=>{
 const page=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
 assert.match(page,/markArrivedIntent\(entry\)/);
 assert.match(page,/\/api\/queue\/\$\{intent\.id\}\/arrive/);
 assert.match(page,/called\.status==='called'&&<button[^]*?>\{tr\("Keldi"\)\}<\/button>/);
 assert.match(page,/called\.status==='arrived'&&<button[^]*?>\{tr\("Xizmat boshlandi"\)\}<\/button>/);
 assert.match(page,/Xizmat tugadi/);
});
test('v96 guest QR and manual pages explain arrival state',()=>{
 const qr=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 const manual=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(qr,/queue_status==='arrived'/);
 assert.match(manual,/Kelganingiz tasdiqlandi/);
});
