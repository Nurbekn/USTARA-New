import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDayCloseReadiness,DAY_CLOSE_LABELS} from '../src/pages/barber/data/dayCloseReadinessV106.js';
const keys=['waiting','called','arrived','in_service','pending_qr','active_bookings','active_offers','past_unresolved'];
const basic=()=>({queue_date:'2026-11-20',as_of:'2026-11-20T10:00:00Z',ready:true,read_only:true,closed:false,revision:0,
 counts:Object.fromEntries(keys.map(k=>[k,0])),blockers:[]});
test('v106: empty summary is only a preview, not a persisted closure',()=>{
 const data=parseDayCloseReadiness(basic());
 assert.ok(data);assert.equal(data.ready,true);assert.equal(data.closed,false);
 assert.deepEqual(data.blockers,[]);
});
for(const key of keys){
 test('v106: '+key+' remains a visible blocker',()=>{
  const x=basic();x.counts[key]=4;x.blockers=[key];x.ready=false;
  assert.deepEqual(parseDayCloseReadiness(x).blockers,[key]);assert.ok(DAY_CLOSE_LABELS[key]);
 });
}
for(const [label,change] of [
 ['missing body',()=>null],
 ['declared ready but blockers exist',x=>({...x,ready:true,counts:{...x.counts,waiting:1},blockers:['waiting']})],
 ['blocker missing',x=>({...x,counts:{...x.counts,arrived:1},ready:false})],
 ['wrong blocker order',x=>({...x,counts:{...x.counts,waiting:1,called:1},ready:false,blockers:['called','waiting']})],
 ['unknown private blocker',x=>({...x,ready:false,blockers:['customer_phone']})],
 ['negative count',x=>({...x,counts:{...x.counts,waiting:-1}})],
 ['string zero',x=>({...x,counts:{...x.counts,waiting:'0'}})],
 ['fractional count',x=>({...x,counts:{...x.counts,waiting:0.5}})],
 ['unbounded count',x=>({...x,counts:{...x.counts,waiting:Number.MAX_SAFE_INTEGER+1}})],
 ['non-calendar day',x=>({...x,queue_date:'2026-02-30'})],
 ['invalid timestamp',x=>({...x,as_of:'not-a-time'})],
 ['invalid closure revision',x=>({...x,revision:-1})],
 ['not read only',x=>({...x,read_only:false})],
 ['duplicate blocker',x=>({...x,ready:false,counts:{...x.counts,called:1},blockers:['called','called']})],
]){
 test('v106: rejects '+label,()=>assert.equal(parseDayCloseReadiness(change(basic())),null));
}
test('v106: extra private fields stripped from view model',()=>{
 const x=basic();x.customer_phone='+998...';x.counts.customer_id=77;
 const parsed=parseDayCloseReadiness(x);
 assert.ok(parsed);assert.equal(parsed.customer_phone,undefined);assert.equal(parsed.counts.customer_id,undefined);
});
