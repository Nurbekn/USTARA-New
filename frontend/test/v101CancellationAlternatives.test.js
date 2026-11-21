import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  alternativeSelection, alternativeDates, alternativeBookingUrl, collectCancellationAlternatives,
} from '../src/pages/user/bookings/cancellationAlternatives.js';

const booking = { id: 71, startsAt: '2030-02-11T08:00:00Z',
  barber: { id: 31 }, services: [{ id: 41 }, { id: 42 }] };
const clock = Date.parse('2030-02-10T10:00:00Z');
const slotsFor = date => ({ date, working: true, slots: [{ time: '10:00' }, { time: '11:00' }] });

test('v101 keeps original ordered service selection for the same barber', () => {
  assert.deepEqual(alternativeSelection(booking), { barberId:31, serviceIds:[41,42] });
  assert.equal(alternativeBookingUrl(booking), '/user/barbers/31?services=41%2C42');
});
test('v101 never creates an auto-booking route when service data is missing', () => {
  assert.equal(alternativeBookingUrl({ ...booking, services:[] }), '/user/explore');
  assert.equal(alternativeSelection({ ...booking, barber:{ id:0 } }), null);
});
test('v101 rejects duplicate, fractional and out-of-range service IDs', () => {
  for (const services of [[{id:41},{id:41}], [{id:2.5}], [{id:2147483648}], [{id:'41'}], [{id:0}]]) {
    assert.equal(alternativeSelection({ ...booking, services }), null);
  }
});
test('v101 restricts suggestion selection to 20 services', () => {
  assert.equal(alternativeSelection({ ...booking, services:Array.from({length:21},(_,i)=>({id:i+1})) }), null);
});
test('v101 suggests the cancelled appointment date first if still future', () => {
  assert.deepEqual(alternativeDates(booking, clock), ['2030-02-11','2030-02-12','2030-02-13']);
});
test('v101 never suggests past days after an appointment date passed', () => {
  assert.deepEqual(alternativeDates(booking, Date.parse('2030-02-20T20:00:00Z')),
    ['2030-02-21','2030-02-22','2030-02-23']);
});
test('v101 calendar rollover between years uses Tashkent time', () => {
  const yearEnd = { ...booking, startsAt:'2030-12-31T22:00:00Z' };
  assert.deepEqual(alternativeDates(yearEnd, Date.parse('2030-12-31T20:00:00Z')),
    ['2031-01-01','2031-01-02','2031-01-03']);
});
test('v101 handles malformed start date without querying a database', async () => {
  let calls=0;
  const result=await collectCancellationAlternatives({ ...booking, startsAt:'invalid' }, {
    fetchSlots:async()=>{calls++;}, nowMs:clock,
  });
  assert.equal(result.reason,'date_unavailable'); assert.equal(calls,0);
});
test('v101 missing service selection does not request availability', async () => {
  let calls=0;
  const result=await collectCancellationAlternatives({ ...booking, services:[] }, {
    fetchSlots:async()=>{calls++;}, nowMs:clock,
  });
  assert.deepEqual(result,{ slots:[], unavailable:true, reason:'service_unavailable' });
  assert.equal(calls,0);
});
test('v101 fetches only same-barber, same-service free slots and caps suggestions', async () => {
  const calls=[];
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,limit:2,fetchSlots:async(params)=>{calls.push(params);return slotsFor(params.date);},
  });
  assert.deepEqual(result.slots,[{date:'2030-02-11',time:'10:00'},{date:'2030-02-11',time:'11:00'}]);
  assert.equal(calls.length,1);
  assert.deepEqual({barberId:calls[0].barberId,serviceIds:calls[0].serviceIds},{barberId:31,serviceIds:[41,42]});
});
test('v101 ignores expired same-day slot times', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:Date.parse('2030-02-11T06:00:00Z'),limit:2,
    fetchSlots:async({date})=>slotsFor(date),
  });
  assert.ok(result.slots.every(x => x.date!=='2030-02-11' || x.time!=='10:00'));
});
test('v101 does not suggest the exact time just cancelled', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,limit:2,fetchSlots:async ({date}) => ({date,working:true,
      slots:[{time:'13:00'},{time:'13:05'}]}),
  });
  assert.deepEqual(result.slots,[{date:'2030-02-11',time:'13:05'}, {date:'2030-02-12',time:'13:00'}]);
});
test('v101 does not show slots from the wrong date or a closed barber', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async ({date}) => date==='2030-02-11'
      ? {date,working:false,slots:[]} : {...slotsFor('2030-02-11')},
  });
  assert.deepEqual(result.slots,[]);
});
test('v101 de-duplicates repeated same-day free slots', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,limit:3,fetchSlots:async ({date}) => ({date,working:true,slots:[{time:'10:00'},{time:'10:00'},{time:'11:00'}]}),
  });
  assert.equal(result.slots.filter(x=>x.date==='2030-02-11'&&x.time==='10:00').length,1);
});
test('v101 rejects malformed and non-five-minute start times', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async ({date}) => ({date,working:true,slots:[{time:'11:03'},{time:'24:00'}, {time:'11:00'}]}),
  });
  assert.equal(result.slots.length,3); // one valid slot on each of 3 days
  assert.ok(result.slots.every(x => x.time==='11:00'));
});
test('v101 checks later dates if a date has no suitable slots', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,limit:1,fetchSlots:async ({date}) => ({date,working:true,slots:date==='2030-02-11'?[]:[{time:'11:00'}]}),
  });
  assert.deepEqual(result.slots,[{date:'2030-02-12',time:'11:00'}]);
});
test('v101 unavailable days are reported without claiming unavailable slots are bookable', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async ({date}) => ({date,working:true,accepting_bookings:false,slots:slotsFor(date).slots}),
  });
  assert.deepEqual(result.slots,[]);
});
test('v101 one failed day and one working day are distinguished', async () => {
  const result=await collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async ({date})=>date==='2030-02-11'
      ? Promise.reject(new Error('network')) : slotsFor(date),
  });
  assert.ok(result.slots.length>0); assert.equal(result.partial,true);
});
test('v101 total API failure does not become an empty available-slots result', async () => {
  await assert.rejects(collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async()=>{throw new Error('network');},
  }),/tekshirib bo‘lmadi/);
});
test('v101 authorization failures remain failures even if later days may be available', async () => {
  await assert.rejects(collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async()=>{throw Object.assign(new Error('unauthorized'),{status:401});},
  }),{status:401});
});
test('v101 session change is never swallowed', async () => {
  await assert.rejects(collectCancellationAlternatives(booking,{
    nowMs:clock,fetchSlots:async()=>{throw Object.assign(new Error('changed'),{code:'session_changed'});},
  }),{code:'session_changed'});
});
test('v101 respects AbortSignal and stops further searches', async () => {
  const controller=new AbortController();
  await assert.rejects(collectCancellationAlternatives(booking,{
    nowMs:clock,signal:controller.signal,fetchSlots:async()=>{controller.abort();throw Object.assign(new Error('aborted'),{name:'AbortError'});},
  }),{name:'AbortError'});
});
test('v101 catches an explicitly invalid limit', async()=>{
  await assert.rejects(collectCancellationAlternatives(booking,{fetchSlots:async()=>{},nowMs:clock,limit:13}), /Limit/);
});
test('v101 UI never calls cancel/create automatically while showing suggestions', async () => {
  const ui=await readFile(new URL('../src/pages/user/bookings/CancellationAlternatives.jsx',import.meta.url),'utf8');
  const page=await readFile(new URL('../src/pages/user/Bookings.jsx',import.meta.url),'utf8');
  assert.ok(page.indexOf('validateCancellation(response, cancelling.id)') < page.indexOf('setCancelledForAlternatives(verifiedCancellation)'));
  assert.match(ui,/loadCancellationAlternatives/);
  assert.doesNotMatch(ui,/cancelCustomerBooking|createBooking\(/);
  assert.match(ui,/Yangi bronni tanlash/);
});
