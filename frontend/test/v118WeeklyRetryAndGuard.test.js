import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {setImmediate} from 'node:timers/promises';

async function moduleUrl(url) {
  let code = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const match of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    code = code.replace(match[0], `from "${await moduleUrl(new URL(match[1], url))}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const {watchAvailabilityWeek, availabilityWeekDates, nextVerifiedAvailableDay} = await import(
  await moduleUrl(new URL('../src/pages/user/barber/weeklyAvailability.js', import.meta.url)));
const dates=Array.from({length:14},(_,i)=>`2030-01-${String(i+1).padStart(2,'0')}`);
const base={barberId:2,serviceIds:[7,8],dates:dates.slice(0,7)};
const reply=(date)=>({date,working:true,slots:[{time:'09:00'}]});
const tick=async()=>{await setImmediate();await setImmediate();};

test('v118 #92 rejects impossible calendar days and dates not consecutive',()=>{
  for(const invalid of [
    [...dates.slice(0,6),'2030-02-30'],
    [...dates.slice(0,6),'2030-01-08'],
    ['2030-01-01','2030-01-02','2030-01-04',...dates.slice(4,8)],
    Array(7).fill('2030-01-01'),
  ]) assert.throws(()=>watchAvailabilityWeek({...base,dates:invalid},()=>{}),RangeError);
});
test('v118 #92 verifies barber/service IDs and rejects invalid loader',()=>{
  for (const change of [
    {barberId:'2'},{barberId:0},{barberId:2147483648},
    {serviceIds:[7,7]},{serviceIds:[7,2147483648]},
    {serviceIds:[7, '8']},{serviceIds:Array(21).fill(1)},
    {loader:1},
  ]) assert.throws(()=>watchAvailabilityWeek({...base,...change},()=>{}),TypeError);
});
test('v118 #92 exact seven day pages remain supported',()=>{
  assert.deepEqual(availabilityWeekDates(dates,0),dates.slice(0,7));
  assert.deepEqual(availabilityWeekDates(dates,1),dates.slice(7,14));
});
test('v118 #92 retry only fails: successful days are preserved without new GETs', async()=>{
  const first=[];
  const stop=watchAvailabilityWeek({...base,loader:async p=>{
    if(p.date===dates[1] || p.date===dates[4]) throw Error('unavailable');
    return reply(p.date);
  }},s=>first.push(s));
  await tick();stop();
  assert.equal(first.at(-1).complete,true);
  assert.equal(first.at(-1).days.filter(d=>d.status==='error').length,2);
  const calls=[],states=[];
  const stopRetry=watchAvailabilityWeek({...base,initialDays:first.at(-1).days,loader:async p=>{
    calls.push(p.date); return reply(p.date);
  }},s=>states.push(s));
  await tick();stopRetry();
  assert.deepEqual(calls.sort(),[dates[1],dates[4]]);
  assert.equal(states.at(-1).complete,true);
  assert.equal(states.at(-1).days.filter(d=>d.status==='available').length,7);
  assert.equal(states.at(-1).days.filter(d=>d.status==='error').length,0);
});
test('v118 retry fails closed for malformed, different or loading previous snapshots',()=>{
  const entries=base.dates.map(date=>({date,status:'empty'}));
  for(const invalid of [
    entries.slice(0,6),
    entries.map((d,i)=>i===2?{...d,date:dates[7]}:d),
    entries.map((d,i)=>i===2?{...d,status:'loading'}:d),
    entries.map((d,i)=>i===2?{...d,status:'available',count:0,first:'10:00'}:d),
  ]) assert.throws(()=>watchAvailabilityWeek({...base,initialDays:invalid},()=>{}),TypeError);
});
test('v118 partial retry failure stays error; no guessed availability',async()=>{
  const init=base.dates.map((date,i)=>({date,status:i===3?'error':'empty'}));
  const states=[];
  const stop=watchAvailabilityWeek({...base,initialDays:init,loader:async()=>{throw Error('offline')}},s=>states.push(s));
  await tick();stop();
  assert.equal(states.at(-1).days[3].status,'error');
  assert.equal(states.at(-1).days.filter(d=>d.status==='empty').length,6);
});
test('v118 partial retry cancels and never publishes late results',async()=>{
  const init=base.dates.map((date,i)=>({date,status:i===3?'error':'empty'}));
  let resolve;const states=[];
  const stop=watchAvailabilityWeek({...base,initialDays:init,loader:p=>new Promise(r=>resolve=r)},s=>states.push(s));
  await tick();const count=states.length;stop();
  resolve(reply(dates[3]));await tick();
  assert.equal(states.length,count);
});
test('v118 next available day requires trustworthy verified status',()=>{
  assert.equal(nextVerifiedAvailableDay(null),null);
  assert.equal(nextVerifiedAvailableDay([{date:dates[0],status:'loading'},{date:dates[1],status:'empty'}]),null);
  assert.equal(nextVerifiedAvailableDay([{date:dates[0],status:'available',count:0},{date:dates[1],status:'available',count:1}]),dates[1]);
  assert.equal(nextVerifiedAvailableDay([{date:'2030-02-30',status:'available',count:3}]),null);
});
test('v118 UI connects weekly retry, selected-day refresh, and week switching without stale selection',async()=>{
 const ui=await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx',import.meta.url),'utf8');
 assert.match(ui,/function retryFailedWeekDays\(/);
 assert.match(ui,/initialDays: weekRetry\?\.key === weekContextKey/);
 assert.match(ui,/setWeekRetry\(null\); setWeekAttempt\(value => value \+ 1\);\s*refreshSlots\(\)/);
 assert.match(ui,/setWeekRetry\(null\); setWeekIndex\(index\);\s*setDate\(dates\[index \* 7\]\); setHour\(''\); setTime\(''\)/);
 assert.match(ui,/nextVerifiedAvailableDay\(week.days\)/);
 assert.match(ui,/onClick=\{refreshWeekAndSelectedDay\}/);
});
