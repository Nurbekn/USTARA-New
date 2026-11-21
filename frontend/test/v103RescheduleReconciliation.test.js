import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresRescheduleReconciliation } from '../src/pages/user/bookings/rescheduleReconciliation.js';

for (const [name,error] of [
  ['unknown committed response',{code:'booking_confirmation_unknown',status:409}],
  ['concurrent booking edit',{code:'booking_changed',status:409}],
  ['customer account switched',{code:'session_changed',status:409}],
  ['network response lost',{status:0}],
  ['expired authentication',{status:401}],
]) test(`v103: ${name} blocks further PATCH until reload`,()=>{
  assert.equal(requiresRescheduleReconciliation(error),true);
});
for (const [name,error] of [
  ['price quote refresh',{code:'price_changed',status:409}],
  ['slot already occupied',{code:'booking_conflict',status:409}],
  ['temporarily unavailable',{status:503}],
  ['nothing known',null],
  ['service validation',{status:400}],
]) test(`v103: ${name} does not falsely claim unknown commit`,()=>{
  assert.equal(requiresRescheduleReconciliation(error),false);
});
