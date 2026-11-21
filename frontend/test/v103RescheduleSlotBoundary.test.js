import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyRescheduleSlots, validateRescheduleReceipt, bookingModificationBody } from '../src/pages/user/bookings/model.js';

const DATE = '2030-06-01';
const raw = () => ({ date: DATE, duration:30, working:true, accepting_bookings:true,
  slots:[{start:'10:00',end:'10:30'},{start:'09:00',end:'09:30'}] });
const check = (patch={}, replacing=false) => verifyRescheduleSlots({...raw(),...patch},DATE,30,replacing);

test('v103: canonical sorting without changing the original server array',()=>{
  const original = raw(), result=verifyRescheduleSlots(original,DATE,30);
  assert.deepEqual(result.slots.map(x=>x.start),['09:00','10:00']);
  assert.deepEqual(original.slots.map(x=>x.start),['10:00','09:00']);
  assert.notStrictEqual(result.slots,original.slots);
});
test('v103: legitimate final 24:00 end is accepted',()=>{
  assert.deepEqual(check({duration:5,slots:[{start:'23:55',end:'24:00'}],total_price:'1000.00'}, true).slots,[{start:'23:55',end:'24:00'}]);
});
test('v103: no working day or paused bookings with zero slots are allowed',()=>{
  for(const patch of [{working:false,slots:[]},{accepting_bookings:false,slots:[]}, {working:false,accepting_bookings:false,slots:[]}]){
    assert.equal(check(patch).slots.length,0);
  }
});
test('v103: changed service quote requires exact, positive, canonical currency string',()=>{
  assert.equal(check({total_price:'100000.50'},true).total_price,'100000.50');
  for(const price of [undefined,12,NaN,'1.2','0.00','1e5','001.00','-1.00','1000.000','Infinity'])
    assert.throws(()=>check({total_price:price},true));
});
for(const [name,patch] of [
  ['wrong date',{date:'2030-06-02'}],
  ['text duration',{duration:'30'}],
  ['fractional duration',{duration:30.5}],
  ['duration off five-minute grid',{duration:31}],
  ['invalid work flag',{working:'true'}],
  ['invalid booking acceptance flag',{accepting_bookings:'true'}],
  ['paused but offered slot',{accepting_bookings:false}],
  ['closed but offered slot',{working:false}],
  ['too many slots',{slots:Array.from({length:289},(_,i)=>({start:'09:00',end:'09:30'}))}],
  ['duplicate starts',{slots:[{start:'09:00',end:'09:30'},{start:'09:00',end:'09:30'}]}],
  ['bad end',{slots:[{start:'09:00',end:'NaN'}]}],
  ['end before start',{slots:[{start:'09:30',end:'09:00'}]}],
  ['end earlier than duration',{slots:[{start:'09:00',end:'09:25'}]}],
  ['end longer than duration',{slots:[{start:'09:00',end:'09:35'}]}],
  ['start off grid',{slots:[{start:'09:02',end:'09:32'}]}],
  ['end off grid',{slots:[{start:'09:00',end:'09:31'}]}],
  ['start at 24:00',{slots:[{start:'24:00',end:'24:00'}]}],
  ['hidden unavailability field',{slots:[{start:'09:00',end:'09:30',available:false}]}],
  ['extra private metadata',{slots:[{start:'09:00',end:'09:30',customerPhone:'+998991234567'}]}],
  ['invalid slots object',{slots:'09:00'}],
  ['missing slots',{slots:undefined}],
]) test(`v103: ${name} is rejected`,()=>assert.throws(()=>check(patch)));

test('v103: time-only receipt may not alter stored service duration',()=>{
  const booking={id:12,barber:{id:3},durationMinutes:30,totalPrice:40000,startsAt:'2030-05-30T10:00:00+05:00',services:[{id:1}]};
  const body=bookingModificationBody(booking,DATE,'10:00');
  const receipt={id:12,barber_id:3,customer_id:8,status:'confirmed',booking_time:body.booking_time,duration_minutes:30,total_price:'40000.00'};
  assert.equal(validateRescheduleReceipt({data:receipt},booking,body,8).id,12);
  for(const patch of [{duration_minutes:45},{total_price:'50000.00'},{total_price:null}])
    assert.throws(()=>validateRescheduleReceipt({data:{...receipt,...patch}},booking,body,8),{code:'booking_confirmation_unknown'});
});
