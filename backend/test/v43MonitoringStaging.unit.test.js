'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {SQL,summarize}=require('../scripts/v41-telegram-delivery-health');
const {parseTapSummary}=require('../scripts/v40-staging');
test('v43 operator read-only SQL identifies pending records overdue more than 15 minutes',()=>{
 assert.equal((SQL.match(/AS overdue_pending/g)||[]).length,2);
 assert.match(SQL,/next_attempt_at<clock_timestamp\(\)-interval '15 minutes'/);
 assert.doesNotMatch(SQL,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|chat_id|token_hash)\b/i);
 const result=summarize([{channel:'queue',status:'pending',total:7,due:5,overdue_pending:3,stale_lease:0}]);
 assert.deepEqual(result.attention.map(x=>x.overdue_pending),[3]);
 assert.equal(result.summary.queue.pending.overdue_pending,3);
});
test('v43 health refuses impossible aggregate combinations',()=>{
 for(const invalid of [-1,4,1.5,Infinity,NaN])
  assert.throws(()=>summarize([{channel:'smart_booking',status:'pending',total:3,due:2,overdue_pending:invalid,stale_lease:0}]));
});
test('v43 staging summary rejects repeated or inconsistent TAP totals even when subprocess exits zero',()=>{
 for(const bad of [
  '# tests 1\n# tests 1\n# pass 1',
  '# tests 2\n# pass 2\n# skipped 1',
  '# tests 2\n# pass 1',
  '# tests 1\n# pass 1\n# fail 1',
 ]) assert.throws(()=>parseTapSummary(bad),/NOT PASS/);
 assert.equal(parseTapSummary('TAP version 13\nok 1 - one\nok 2 - two\nok 3 - three\n1..3\n# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0').pass,3);
});
