'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {SQL,summarize,audit}=require('../scripts/v41-telegram-delivery-health');
test('v41 operator health query is aggregate-only and read-only for both outboxes',()=>{
 assert.match(SQL,/walkin_queue_notification_outbox/);assert.match(SQL,/smart_booking_telegram_outbox/);
 assert.match(SQL,/GROUP BY status/);assert.match(SQL,/clock_timestamp\(\)/);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|chat_id|token_hash)\b/i);
});
test('v41 health summary counts uncertain and failed without leaking identities',async()=>{
 const rows=[{channel:'queue',status:'uncertain',total:3,due:0,stale_lease:0},
  {channel:'smart_booking',status:'failed',total:2,due:0,stale_lease:0},
  {channel:'queue',status:'pending',total:4,due:1,stale_lease:0}];
 const data=await audit({query:async()=>({rows})});
 assert.equal(data.attention.length,2);
 assert.equal(data.summary.queue.uncertain.total,3);
 assert.ok(!JSON.stringify(data).includes('chat_id'));
});
test('v41 unexpected status and malformed counts fail closed',()=>{
 for(const row of [{channel:'queue',status:'evil',total:1,due:0,stale_lease:0},
  {channel:'queue',status:'pending',total:1,due:2,stale_lease:0},
  {channel:'unknown',status:'sent',total:1,due:0,stale_lease:0}])
  assert.throws(()=>summarize([row]));
});
