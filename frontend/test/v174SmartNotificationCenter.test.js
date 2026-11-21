import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { buildSmartNotificationCenterV174, smartNotificationTextV174 } from '../src/pages/user/bookings/smartNotificationCenterV174.js';
const fixture = [
 {id:7,status:'confirmed',startsAt:'2026-12-22T12:00:00+05:00',barber:{first_name:'Ali'}},
 {id:8,status:'cancelled',startsAt:'2026-12-23T12:00:00+05:00',barber:{first_name:'Vali'}},
 {id:9,status:'pending',startsAt:'2026-12-20T12:00:00+05:00',barber:{first_name:'Nozim'}},
 {id:10,status:'completed',startsAt:'2026-12-19T12:00:00+05:00',barber:{first_name:'Bobur'}},
];
test('#131 only actual backend booking statuses are counted',()=>{
 const all=buildSmartNotificationCenterV174([...fixture,{id:11,status:'sent',startsAt:'2026-12-18T10:00:00Z'}]);
 assert.deepEqual(all.counts,{all:4,active:2,history:2});
 assert.deepEqual(all.items.map(i=>i.id),[8,7,9,10]);
 assert.equal(all.items[0].url,'/user/bookings?booking=8');
});
test('#131 server active state does not infer completion from clock',()=>{
 const active=buildSmartNotificationCenterV174(fixture,{filter:'active'});
 assert.deepEqual(active.items.map(x=>x.id),[7,9]);
 const historical=buildSmartNotificationCenterV174(fixture,{filter:'history'});
 assert.deepEqual(historical.items.map(x=>x.id),[8,10]);
});
test('#131 labels in three languages, unknown language defaults to Uzbek',()=>{
 const translated=['uz','ru','en'].map(lang=>buildSmartNotificationCenterV174(fixture,{lang}).items[0].title);
 assert.equal(new Set(translated).size,3);
 for(const lang of ['uz','ru','en']) {
  assert.ok(smartNotificationTextV174(lang).refresh);
  assert.match(smartNotificationTextV174(lang).explanation,/server|Server|сервера/i);
 }
 assert.equal(smartNotificationTextV174('bogus').refresh,smartNotificationTextV174('uz').refresh);
});
test('#131 bounded filtered inbox and fail-closed invalid entries',()=>{
 assert.deepEqual(buildSmartNotificationCenterV174(undefined).items,[]);
 assert.equal(buildSmartNotificationCenterV174(fixture,{filter:'nonsense'}).filter,'all');
 assert.equal(buildSmartNotificationCenterV174(fixture,{filter:'active',maxItems:1}).items.length,1);
 assert.equal(buildSmartNotificationCenterV174(fixture,{filter:'active',maxItems:1}).truncated,true);
 assert.equal(buildSmartNotificationCenterV174(fixture,{filter:'active',maxItems:-1}).items.length,2);
});
test('#131 layout enforces session fencing and read-only inbox',()=>{
 const src=readFileSync(new URL('../src/layouts/UserLayout.jsx',import.meta.url),'utf8');
 assert.match(src,/subscribeSession/);
 assert.match(src,/notificationsController.current\?\.abort\(\)/);
 assert.match(src,/current\?\.token === source.token/);
 assert.match(src,/smartInbox.items/);
 assert.match(src,/aria-pressed=\{inboxFilter === kind\}/);
 assert.match(src,/refreshBookingInbox/);
 assert.doesNotMatch(src,/markAsRead|pushEventSent/);
});
