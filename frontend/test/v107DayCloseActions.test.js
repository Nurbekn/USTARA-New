import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dayCloseIntent,dayReopenIntent,sameDayAction} from '../src/pages/barber/data/dayCloseActionsV107.js';
import {parseDayCloseReadiness} from '../src/pages/barber/data/dayCloseReadinessV106.js';
const at='2026-11-20T10:00:00Z';
const session={role:'barber',token:'good-token'};
const preview=(values={})=>({queue_date:'2026-11-20',as_of:at,ready:true,closed:false,revision:0,
 counts:{waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0},
 blockers:[],read_only:true,...values});
test('v107: requires clean current preview to ask for close',()=>{
 const intent=dayCloseIntent(preview(),session,3,Date.parse(at)+1000);
 assert.equal(intent.body.confirm,'CLOSE');assert.equal(intent.body.expected_revision,0);
 assert.equal(intent.body.expected_date,'2026-11-20');assert.equal(intent.body.reviewed_at,at);
 assert.equal(sameDayAction(intent,session,3,Date.parse(at)+2000),true);
});
for(const variant of [
 {ready:false,blockers:['waiting'],counts:{...preview().counts,waiting:1}},
 {closed:true,revision:1},{revision:-1},{as_of:'bad'}
]){
 test('v107: invalid or blocked preview cannot close',()=>{
  assert.equal(dayCloseIntent(preview(variant),session,3,Date.parse(at)),null);
 });
}
test('v107: preview expires after 30 seconds',()=>{
 assert.equal(dayCloseIntent(preview(),session,3,Date.parse(at)+30001),null);
 const intent=dayCloseIntent(preview(),session,3,Date.parse(at)+100);
 assert.equal(sameDayAction(intent,session,3,Date.parse(at)+30001),false);
});
test('v107: no acceptance before preview timestamp',()=>{
 assert.equal(dayCloseIntent(preview(),session,3,Date.parse(at)-1000),null);
});
test('v107: another account or session epoch cannot reuse close confirmation',()=>{
 const intent=dayCloseIntent(preview(),session,3,Date.parse(at)+1000);
 assert.equal(sameDayAction(intent,{role:'barber',token:'different'},3,Date.parse(at)+1000),false);
 assert.equal(sameDayAction(intent,session,4,Date.parse(at)+1000),false);
 assert.equal(sameDayAction(intent,{role:'customer',token:'good-token'},3,Date.parse(at)+1000),false);
});
test('v107: only persisted closed snapshot can reopen',()=>{
 assert.equal(dayReopenIntent(preview(),session,3),null);
 const intent=dayReopenIntent(preview({closed:true,revision:4}),session,3,Date.parse(at)+1000);
 assert.equal(intent.body.confirm,'REOPEN');assert.equal(intent.body.expected_revision,4);
 assert.equal(sameDayAction(intent,session,3,Date.parse(at)+2000),true);
});
test('v107: strict preview parsing accepts persisted state with revision',()=>{
 const parsed=parseDayCloseReadiness(preview({closed:true,revision:2}));
 assert.equal(parsed.closed,true);assert.equal(parsed.revision,2);
 assert.equal(parseDayCloseReadiness(preview({revision:'2'})),null);
 assert.equal(parseDayCloseReadiness(preview({closed:'true'})),null);
});
