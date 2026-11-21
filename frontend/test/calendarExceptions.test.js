import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDates,validateCalendarHours} from '../src/pages/barber/data/calendarExceptions.js';
test('vacation range preserves calendar dates regardless of timezone and leap day',()=>{
  assert.deepEqual(calendarDates('2028-02-28','2028-03-01'),['2028-02-28','2028-02-29','2028-03-01']);
});
test('invalid date, reverse range and excessive vacation rejected',()=>{
  for(const [a,b] of [['2027-02-29','2027-03-01'],['2027-01-20','2027-01-19'],['2027-01-01','2027-05-01']]){
    assert.throws(()=>calendarDates(a,b));
  }
});
test('break must fit entirely inside effective working hours',()=>{
  assert.deepEqual(validateCalendarHours({start:'09:00',end:'18:00',breakEnabled:true,breakStart:'13:00',breakEnd:'14:00'}),
    {is_closed:false,start_time:'09:00',end_time:'18:00',break_start:'13:00',break_end:'14:00'});
  for(const v of [{breakStart:'08:30',breakEnd:'09:30'},{breakStart:'17:30',breakEnd:'18:30'},{breakStart:'15:00',breakEnd:'13:00'}]){
    assert.throws(()=>validateCalendarHours({start:'09:00',end:'18:00',breakEnabled:true,...v}));
  }
});
