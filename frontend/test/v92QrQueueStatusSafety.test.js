import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseQrQueueStatus} from '../src/pages/queue/qrStatusReadGuard.js';
const when='2026-11-19T12:30:00.000Z';
const offer={id:4,status:'pending',starts_at:'2026-11-19T13:00:00.000Z',expires_at:when,confirmation_deadline:null};
const active={status:'approved',queue_status:'waiting',position:2,estimated_wait:{min_minutes:5,max_minutes:30,approximate:true},
 telegram_linked:false,offers_enabled:false,smart_offer:null};
const valid=x=>parseQrQueueStatus(x);
test('v92 pending and expired responses never carry server extras to UI',()=>{
 assert.deepEqual(valid({status:'pending',private_phone:'+99800000'}),{status:'pending'});
 assert.deepEqual(valid({status:'expired',token:'secret'}),{status:'expired'});
});
test('v92 active queue gets strictly minimal fields',()=>{
 const parsed=valid({...active,phone:'private',display_label:'private',smart_offer:{...offer,secret:'do not show'},extra:1});
 assert.equal(parsed.position,2);assert.equal(parsed.smart_offer.id,4);
 assert.ok(!JSON.stringify(parsed).includes('private'));
 assert.ok(!JSON.stringify(parsed).includes('secret'));
});
test('v92 approved terminal queue state hides stale position and offer',()=>{
 assert.deepEqual(valid({...active,queue_status:'left',position:null,estimated_wait:null,smart_offer:null}).queue_status,'left');
 assert.deepEqual(valid({...active,queue_status:null,position:null,estimated_wait:null,smart_offer:null}).queue_status,null);
});
for(const invalid of [null,[],{},'pending',{status:'fake'},{status:1},{status:'approved'},
 {...active,queue_status:'called',position:2},{...active,queue_status:'missed',smart_offer:offer,position:null,estimated_wait:null},
 {...active,position:'2'},{...active,position:2147483648},{...active,estimated_wait:{min_minutes:5,max_minutes:1600,approximate:true}},
 {...active,estimated_wait:{min_minutes:5,max_minutes:30,approximate:'true'}},
 {...active,telegram_linked:'false'}, {...active,offers_enabled:true},
 {...active,smart_offer:{...offer,id:0}}, {...active,smart_offer:{...offer,status:'accepted'}},
 {...active,smart_offer:{...offer,expires_at:'2026-02-30T12:30:00.000Z'}},
 {...active,smart_offer:{...offer,status:'pending',confirmation_deadline:when}},
]){
 test('v92 rejects invalid QR result '+JSON.stringify(invalid),()=>assert.equal(valid(invalid),null));
}
test('v92 accepted offer preserves valid confirmation deadline',()=>{
 const result=valid({...active,smart_offer:{...offer,status:'accepted',confirmation_deadline:when}});
 assert.equal(result.smart_offer.status,'accepted');
});
test('v92 QR page suppresses action panels on unavailable status',()=>{
 const s=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 assert.match(s,/!statusUnavailable&&status==='approved'&&ticket\?\.queue_status==='waiting'&&ticket\?\.smart_offer/);
 assert.match(s,/!statusUnavailable&&status==='approved'&&ticket\?\.queue_status==='waiting'&&<div/);
 assert.match(s,/if\(statusUnavailable\|\|leaveBusy/);
 assert.match(s,/setLeaveConfirm\(false\)/);
 assert.match(s,/parseQrQueueStatus\(data\)/);
});
test('v92 a session swap cannot display previous account booking result',()=>{
 const s=readFileSync(new URL('../src/pages/queue/QueueCheckIn.jsx',import.meta.url),'utf8');
 assert.match(s,/subscribeSession/);
 assert.match(s,/if\(keyRef\.current!==receipt \|\| getSession\(\)\?\.token!==authToken\)return/);
 assert.match(s,/setBookingResult\(null\)/);
});
