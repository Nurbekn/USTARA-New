import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDayCloseReadiness} from '../src/pages/barber/data/dayCloseReadinessV106.js';
import {dayCloseIntent,dayReopenIntent,sameDayAction} from '../src/pages/barber/data/dayCloseActionsV107.js';
const t='2026-11-20T10:00:00Z';
const now=Date.parse(t);
const user={role:'barber',token:'active-token'};
const preview=(rest={})=>({queue_date:'2026-11-20',as_of:t,closed:false,ready:true,revision:0,
 counts:{waiting:0,called:0,arrived:0,in_service:0,pending_qr:0,active_bookings:0,active_offers:0,past_unresolved:0},blockers:[],read_only:true,...rest});
test('v109: reopening confirmation must be fresh and carries server review time',()=>{
 const p=parseDayCloseReadiness(preview({closed:true,revision:1}));
 const x=dayReopenIntent(p,user,2,now+1000);
 assert.equal(x.body.confirm,'REOPEN');assert.equal(x.body.reviewed_at,t);
 assert.equal(x.expires,now+30000);assert.equal(sameDayAction(x,user,2,now+29999),true);
 assert.equal(sameDayAction(x,user,2,now+30001),false);
});
test('v109: expired and future reopen previews cannot be confirmed',()=>{
 const p=parseDayCloseReadiness(preview({closed:true,revision:1}));
 assert.equal(dayReopenIntent(p,user,2,now+30001),null);
 assert.equal(dayReopenIntent(p,user,2,now-1),null);
});
test('v109: reopen cannot be reused across accounts or session epochs',()=>{
 const p=parseDayCloseReadiness(preview({closed:true,revision:1}));
 const x=dayReopenIntent(p,user,3,now+1000);
 assert.equal(sameDayAction(x,{role:'barber',token:'other'},3,now+1000),false);
 assert.equal(sameDayAction(x,user,4,now+1000),false);
});
for(const broken of [
 {as_of:'2026-11-20T20:00:00Z'},
 {as_of:'2026-11-20T10:00:00'},
 {as_of:'2026-11-19T18:00:00Z'},
 {queue_date:'2026-11-31'},
 {queue_date:'2026-11-21'},
]){
 test('v109: reject mismatched browser preview '+JSON.stringify(broken),()=>{
  assert.equal(parseDayCloseReadiness(preview(broken)),null);
  assert.equal(dayCloseIntent(preview(broken),user,1,now),null);
  assert.equal(dayReopenIntent(preview({closed:true,revision:2,...broken}),user,1,now),null);
 });
}
test('v109: close action rejects conflicting blockers despite ready=true',()=>{
 const bad=preview({blockers:['waiting']});
 assert.equal(dayCloseIntent(bad,user,1,now),null);
});
test('v109: empty session token cannot authorize day mutations',()=>{
 assert.equal(dayCloseIntent(preview(),{role:'barber',token:''},1,now),null);
 assert.equal(dayReopenIntent(preview({closed:true,revision:1}),{role:'barber',token:''},1,now),null);
});
test('v109: valid timezone-offset preview still shows correct Tashkent date',()=>{
 const p=preview({as_of:'2026-11-20T15:00:00+05:00'});
 assert.ok(parseDayCloseReadiness(p));
 assert.ok(dayCloseIntent(p,user,1,now+1000));
});
