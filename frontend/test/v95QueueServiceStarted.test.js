import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callNextIntent,finishIntent,startServiceIntent} from '../src/pages/barber/data/queueMutationIntentV94.js';
import {classifyQueue} from '../src/pages/barber/data/queueModel.js';
import {parseBarberQueueSnapshot} from '../src/pages/barber/data/barberQueueReadGuardV93.js';
import {parseQrQueueStatus} from '../src/pages/queue/qrStatusReadGuard.js';
import {parseManualQueueEntries} from '../src/pages/queue/manualQueueReadGuard.js';
import {statusLabel,isActiveTicket} from '../src/pages/queue/qrModel.js';
import {canSelfExitQueue} from '../src/pages/queue/queueExitEligibility.js';
const stamp='2026-11-19T10:05:00.000Z';
const q=(status='in_service',overrides={})=>({id:'15',display_label:'Mijoz',queue_date:'2026-11-19',status,
 queue_position:1,created_at:stamp,called_at:stamp,started_at:status==='in_service'?stamp:null,
 finished_at:null,...overrides});
const snapshot=entry=>parseBarberQueueSnapshot({active:[entry],recent:[]},{pending:[]},{openings:[]});
test('v95 only observed called ticket can start service',()=>{
 assert.deepEqual(startServiceIntent({id:'15',status:'called'}),{id:15,body:{expected_status:'called'}});
 for(const status of ['waiting','in_service','served','missed','left'])
  assert.equal(startServiceIntent({id:15,status}),null);
});
for(const bad of [undefined,null,0,-1,'01','0x10','1e2','9007199254740992',{},1.25]){
 test('v95 malformed service start ID rejected '+String(bad),()=>{
  assert.equal(startServiceIntent({id:bad,status:'called'}),null);
 });
}
test('v95 in-service can only complete, not miss or leave',()=>{
 assert.deepEqual(finishIntent({id:15,status:'in_service'},'served'),
  {id:15,body:{status:'served',expected_status:'in_service'}});
 for(const status of ['left','missed','called'])assert.equal(finishIntent({id:15,status:'in_service'},status),null);
});
test('v95 classification treats in-service as active and prevents another call',()=>{
 const result=classifyQueue([q('in_service'),q('waiting',{id:16,called_at:null})],'2026-11-19');
 assert.equal(result.called.status,'in_service');assert.equal(result.waiting.length,1);
 assert.equal(callNextIntent(result.called,result.waiting),null);
});
test('v95 in-service screenshot is sanitized and private extras removed',()=>{
 const result=snapshot({...q(),phone:'+998999999999',token:'private'});
 assert.equal(result.active[0].status,'in_service');
 assert.equal(result.active[0].started_at,stamp);
 assert.equal('phone' in result.active[0],false);
});
test('v95 invalid in-service timestamps are rejected',()=>{
 assert.equal(snapshot(q('in_service',{started_at:null})),null);
 assert.equal(snapshot(q('in_service',{called_at:null})),null);
 assert.equal(snapshot(q('in_service',{finished_at:stamp})),null);
 assert.equal(snapshot(q('called',{started_at:stamp})),null);
});
test('v95 QR status permits service started without exposing other tickets',()=>{
 const result=parseQrQueueStatus({status:'approved',queue_status:'in_service',position:null,
  estimated_wait:null,telegram_linked:false,offers_enabled:false,smart_offer:null,others:'private'});
 assert.deepEqual(result,{status:'approved',queue_status:'in_service',position:null,
  estimated_wait:null,telegram_linked:false,offers_enabled:false,smart_offer:null});
});
test('v95 in-service QR cannot advertise waiting slot or offer',()=>{
 const base={status:'approved',queue_status:'in_service',position:null,estimated_wait:null,
  telegram_linked:false,offers_enabled:false,smart_offer:null};
 assert.equal(parseQrQueueStatus({...base,position:1}),null);
 assert.equal(parseQrQueueStatus({...base,estimated_wait:{min_minutes:5,max_minutes:10,approximate:true}}),null);
});
test('v95 in-service QR keeps polling but service exit is not offered',()=>{
 assert.equal(isActiveTicket('approved','in_service'),true);
 assert.match(statusLabel('approved','in_service'),/Xizmatingiz boshlandi/);
 const page=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 assert.match(page,/queue_status==='in_service'/);
 assert.match(page,/canSelfExitQueue\(ticket\?\.queue_status\)/);
 assert.equal(canSelfExitQueue('in_service'),false);
});
test('v95 manual linked ticket displays in-service but no offer',()=>{
 const actual=parseManualQueueEntries({entries:[{id:15,barber_id:7,queue_position:1,
  status:'in_service',smart_offer:null}]});
 assert.equal(actual[0].status,'in_service');assert.equal(actual[0].smart_offer,null);
 const page=readFileSync(new URL('../src/pages/queue/ManualQueue.jsx',import.meta.url),'utf8');
 assert.match(page,/Xizmat boshlandi/);
 assert.match(page,/canSelfExitQueue\(entry\.status\)/);
 assert.equal(canSelfExitQueue('in_service'),false);
});
test('v95 staff UI has independent start and finish actions and blocks stale tickets',()=>{
 const page=readFileSync(new URL('../src/pages/barber/Queue.jsx',import.meta.url),'utf8');
 assert.match(page,/startServiceIntent\(entry\)/);
 assert.match(page,/\/api\/queue\/\$\{intent\.id\}\/start/);
 assert.match(page,/called\.status==='called'&&<button/);
 assert.match(page,/called\.status==='in_service'&&<button/);
 assert.match(page,/Xizmat tugadi/);
});
