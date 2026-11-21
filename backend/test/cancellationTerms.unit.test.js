const { test } = require('node:test');
const assert = require('node:assert/strict');
const {checkExpectedCancellationPolicy} = require('../services/cancellationTerms');
const current = {cancellation_cutoff_minutes:60,cancellation_policy_text:'Oldindan xabar bering'};
test('booking confirms previewed policy under the barber lock; legacy callers remain compatible',()=>{
  assert.deepEqual(checkExpectedCancellationPolicy({},current),{ok:true});
  assert.deepEqual(checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:60,text:'Oldindan xabar bering'}},current),{ok:true});
  const changed=checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:120,text:'Oldindan xabar bering'}},current);
  assert.equal(changed.status,409); assert.equal(changed.code,'cancellation_policy_changed');
  assert.equal(checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:60,text:'Old text'}},current).status,409);
  assert.equal(checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:'60',text:null}},current).status,400);
});
test('empty cancellation policy matches null snapshot and rejects fees',()=>{
  assert.deepEqual(checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:null,text:null}},{}),{ok:true});
  assert.equal(checkExpectedCancellationPolicy({expected_cancellation_policy:{cutoff_minutes:null,text:null,fee:123}},{ }).status,400);
});
