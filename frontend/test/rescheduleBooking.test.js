import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rescheduleTime, tashkentFields, bookingModificationBody, bookingServiceIds } from '../src/pages/user/bookings/model.js';

test('Tashkent time uses explicit UTC+05:00, not browser local timezone', () => {
  assert.deepEqual(tashkentFields('2030-01-07T05:30:00.000Z'),{date:'2030-01-07',time:'10:30'});
  assert.equal(rescheduleTime('2030-01-07','10:30'),'2030-01-07T10:30:00+05:00');
});
test('rescheduling rejects invalid time steps and calendar dates',()=>{
  for(const [date,time] of [['2030-01-07','10:03'], ['2030-02-30','10:30'],['2030-01-07','25:30'],['2030-01-07','10:60']])
    assert.throws(()=>rescheduleTime(date,time));
});

const saved = { startsAt:'2030-01-07T05:30:00.000Z', services:[{id:21},{id:22}] };
test('changing services keeps optimistic old snapshot and confirmed server price',()=>{
  assert.deepEqual(bookingServiceIds(saved),[21,22]);
  assert.deepEqual(bookingModificationBody(saved,'2030-01-07','10:30',[22,23],'75000.00'),{
    booking_time:'2030-01-07T10:30:00+05:00',
    expected_booking_time:saved.startsAt,
    service_ids:[22,23],expected_service_ids:[21,22],expected_total_price:'75000.00',
  });
});
test('changing only the time never replaces services or historical price',()=>{
  assert.deepEqual(Object.keys(bookingModificationBody(saved,'2030-01-07','11:00')).sort(),['booking_time','expected_booking_time']);
});
test('service edit refuses missing quote, duplicate IDs and missing old service snapshot',()=>{
  for(const [ids,quote] of [[[23],null],[[23,23],'60000.00'],[[],'60000.00'],[[23],'-2']]){
    assert.throws(()=>bookingModificationBody(saved,'2030-01-07','11:00',ids,quote));
  }
  assert.throws(()=>bookingModificationBody({...saved,services:[]},'2030-01-07','11:00',[23],'60000.00'));
});
