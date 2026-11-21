import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {safeNotificationHistory,EVENT_LABELS,DELIVERY_LABELS} from '../src/components/customerBookingNotificationModelV191.js';
const good={notices:[{id:'9',bookingId:18,event:'confirmed',status:'accepted',createdAt:'2026-11-21T09:10:00Z'}]};
test('v191 customer status does not treat accepted as read or delivered',()=>{
 assert.equal(safeNotificationHistory(good).length,1);
 for(const l of ['uz','ru','en']){
  assert.ok(EVENT_LABELS[l].confirmed);assert.ok(DELIVERY_LABELS[l].accepted);
  assert.doesNotMatch(DELIVERY_LABELS[l].accepted,/delivered|доставлено|yetkazildi/i);
 }
});
test('v191 customer notification history rejects invalid and oversized data',()=>{
 for(const bad of [{notices:Array(21).fill(good.notices[0])},{notices:[{...good.notices[0],status:'read'}]},
 {notices:[{...good.notices[0],bookingId:-1}]},{notices:[{...good.notices[0],chatId:'secret',createdAt:'nonsense'}]},
 {notices:[{...good.notices[0],event:'hack'}]},{}])assert.equal(safeNotificationHistory(bad),null);
});
test('v191 customer history fetch is session scoped and does not expose chat IDs',()=>{
 const ui=fs.readFileSync(new URL('../src/components/CustomerBookingNotificationHistoryV191.jsx',import.meta.url),'utf8');
 assert.match(ui,/sameCustomerSession/);
 assert.match(ui,/subscribeSession/);
 assert.match(ui,/AbortController/);
 assert.match(ui,/\/api\/customers\/telegram\/notifications/);
 assert.doesNotMatch(ui,/sendMessage|chat_id|token_hash|localStorage/);
 const parent=fs.readFileSync(new URL('../src/components/CustomerTelegramV190.jsx',import.meta.url),'utf8');
 assert.match(parent,/CustomerBookingNotificationHistoryV191/);
});
