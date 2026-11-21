import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBreakRanges,intervalsForWeek,intervalsForDate,weekDays} from '../src/pages/barber/data/breakRules.js';
test('multiple intervals sorted and non-overlapping',()=>{
  assert.deepEqual(validateBreakRanges([{start:'15:00',end:'15:30'},{start:'12:00',end:'13:00'}]),
    [{start:'12:00',end:'13:00'},{start:'15:00',end:'15:30'}]);
  assert.deepEqual(validateBreakRanges([]),[]);
});
test('overlap, bad dates and non-five-minute times rejected',()=>{
  for(const ranges of [
    [{start:'13:00',end:'14:00'},{start:'13:30',end:'14:30'}],
    [{start:'12:01',end:'12:30'}],
    [{start:'13:00',end:'12:00'}],
    Array(9).fill({start:'13:00',end:'14:00'}),
  ])assert.throws(()=>validateBreakRanges(ranges));
});
test('weekly / dated drafts select only the chosen calendar key',()=>{
  assert.equal(weekDays.length,7);
  assert.deepEqual(intervalsForWeek([{day_of_week:1,start:'13:00',end:'14:00'},{day_of_week:2,start:'12:00',end:'13:00'}],1),[{start:'13:00',end:'14:00'}]);
  assert.deepEqual(intervalsForDate([{date:'2030-04-01',start:'10:00',end:'10:30'}],'2030-04-02'),[]);
});
