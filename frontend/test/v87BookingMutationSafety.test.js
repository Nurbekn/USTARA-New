import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingModificationBody, validateRescheduleReceipt } from '../src/pages/user/bookings/model.js';

const booking = {
  id: 61, barber: { id: 23 }, startsAt: '2030-01-07T05:00:00.000Z',
  durationMinutes: 30, services: [{ id: 34 }, { id: 35 }],
};
const body = bookingModificationBody(booking, '2030-01-07', '11:00');
const saved = { id:61, customer_id:12, barber_id:23, status:'confirmed',
  duration_minutes:30, booking_time:'2030-01-07T06:00:00.000Z' };
const verify = (data, input = body, ids = null, quote = null) =>
  validateRescheduleReceipt({data}, booking, input, 12, ids, quote);

test('v87: valid receipt in another ISO offset is accepted', () => {
  assert.equal(verify({ ...saved,booking_time:'2030-01-07T11:00:00+05:00' }).id,61);
});
test('v87: active pending receipt is allowed', () => {
  assert.equal(verify({ ...saved, status:'pending' }).status, 'pending');
});
for (const [name, patch] of [
  ['foreign customer', {customer_id:99}],
  ['unknown customer', {customer_id:null}],
  ['another barber', {barber_id:66}],
  ['different booking', {id:60}],
  ['cancelled status', {status:'cancelled'}],
  ['completed status', {status:'completed'}],
  ['missing status', {status:undefined}],
  ['changed time', {booking_time:'2030-01-07T06:05:00Z'}],
  ['invalid time', {booking_time:'invalid'}],
  ['zero duration', {duration_minutes:0}],
  ['fractional duration', {duration_minutes:30.5}],
  ['wrong time step', {duration_minutes:31}],
  ['missing duration', {duration_minutes:undefined}],
  ['snapshot refresh required', {snapshot_refresh_required:true}],
]) {
  test(`v87: ${name} cannot count as a confirmed reschedule`, () => {
    assert.throws(() => verify({...saved,...patch}), error =>
      error.code === 'booking_confirmation_unknown' && error.status === 409);
  });
}
test('v87: missing API body cannot count as success', () => {
  assert.throws(() => validateRescheduleReceipt({},booking,body,12), {code:'booking_confirmation_unknown'});
});
const editBody = bookingModificationBody(booking,'2030-01-07','11:00',[34,36],'75000.00');
const editReceipt = { ...saved, total_price:'75000.00',duration_minutes:45,
  services:[{id:34},{id:36}] };
test('v87: verified price + service order allow edited receipt', () => {
  assert.equal(verify(editReceipt,editBody,[34,36],'75000.00').duration_minutes,45);
});
for (const [name, patch] of [
  ['missing snapshot services', {services:undefined}],
  ['reordered services', {services:[{id:36},{id:34}]}],
  ['different service', {services:[{id:34},{id:37}]}],
  ['incomplete snapshot services', {services:[{id:34}]}],
  ['wrong amount', {total_price:'75001.00'}],
  ['missing amount', {total_price:undefined}],
  ['NaN amount', {total_price:'NaN'}],
]) {
  test(`v87: ${name} rejects edited-service receipt`, () => {
    assert.throws(() => verify({...editReceipt,...patch},editBody,[34,36],'75000.00'),
      {code:'booking_confirmation_unknown'});
  });
}
