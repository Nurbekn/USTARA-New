import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCalendarHours} from '../src/pages/barber/data/calendarExceptions.js';
const good={start:'09:00',end:'18:00',breakEnabled:true,breakStart:'13:00',breakEnd:'14:00'};
test('v113: barber calendar supports valid five-minute steps',()=>{
 assert.equal(validateCalendarHours({...good,end:'18:05'}).end_time,'18:05');
 assert.equal(validateCalendarHours({...good,breakStart:'13:05'}).break_start,'13:05');
});
for(const field of ['start','end','breakStart','breakEnd']){
 test('v113: invalid '+field+' five-minute step cannot be submitted',()=>{
  assert.throws(()=>validateCalendarHours({...good,[field]:'13:02'}));
 });
}
test('v113: optional break is ignored when disabled; malformed main hours still rejected',()=>{
 assert.equal(validateCalendarHours({...good,breakEnabled:false,breakStart:'bad',breakEnd:null}).break_start,null);
 assert.throws(()=>validateCalendarHours({...good,breakEnabled:false,start:'09:03'}));
});
