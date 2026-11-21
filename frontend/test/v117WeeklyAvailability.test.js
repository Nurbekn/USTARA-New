import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { setImmediate } from 'node:timers/promises';

async function loadModule(url) {
  let code = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const importMatch of [...code.matchAll(/from ["']([^"']+)["']/g)]) {
    const dep = await loadModule(new URL(importMatch[1], url));
    code = code.replace(importMatch[0], `from "${dep}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const { availabilityWeekDates, availabilityDaySummary, watchAvailabilityWeek } = await import(
  await loadModule(new URL('../src/pages/user/barber/weeklyAvailability.js', import.meta.url)));
const dates = Array.from({ length: 14 }, (_, i) => `2030-01-${String(i + 1).padStart(2, '0')}`);
const input = { barberId: 9, serviceIds: [11, 12], dates: dates.slice(0, 7), token: 'token' };
const response = (date, slots = [{time:'10:00'}]) => ({ date, working:true, accepting_bookings:true, slots });
const tick = async () => { await setImmediate(); await setImmediate(); };

test('two exact seven-day pages preserve 14-day booking horizon', () => {
  assert.deepEqual(availabilityWeekDates(dates, 0), dates.slice(0, 7));
  assert.deepEqual(availabilityWeekDates(dates, 1), dates.slice(7));
  assert.deepEqual(availabilityWeekDates(dates, 2), []);
  assert.deepEqual(availabilityWeekDates(null, 0), []);
});
test('summary comes only from corresponding server date and free slots', () => {
  assert.deepEqual(availabilityDaySummary(dates[0], response(dates[0], [{time:'09:00'}])),
    {date:dates[0],status:'available',count:1,first:'09:00'});
  assert.deepEqual(availabilityDaySummary(dates[0], response(dates[0], [])), {date:dates[0],status:'empty'});
  assert.equal(availabilityDaySummary(dates[0], response(dates[0], [{time:'14:00'}, {time:'09:00'}])).first,'09:00');
  assert.deepEqual(availabilityDaySummary(dates[0], {...response(dates[0]),working:false}), {date:dates[0],status:'closed'});
  assert.deepEqual(availabilityDaySummary(dates[0], {...response(dates[0]),accepting_bookings:false}), {date:dates[0],status:'paused'});
  assert.throws(() => availabilityDaySummary(dates[0],response(dates[1])));
});
test('refuses invalid week, missing services and missing listener', () => {
  assert.throws(() => watchAvailabilityWeek({...input,dates: dates.slice(0,6)},()=>{}),RangeError);
  assert.throws(() => watchAvailabilityWeek({...input,dates: Array(7).fill(dates[0])},()=>{}),RangeError);
  assert.throws(() => watchAvailabilityWeek({...input,serviceIds:[]},()=>{}),TypeError);
  assert.throws(() => watchAvailabilityWeek(input),TypeError);
});
test('all seven GETs use exact barber, services, token and selected dates; nothing fabricated', async () => {
  const calls = []; const states = [];
  const stop = watchAvailabilityWeek({ ...input, loader:async p=>{
    calls.push(p); return response(p.date,p.date===dates[2]?[]:[{time:'11:30'}]);
  } }, state => states.push(state));
  await tick(); stop();
  assert.equal(calls.length, 7);
  assert.deepEqual(calls.map(p=>p.date).sort(),dates.slice(0,7));
  assert.ok(calls.every(p=>p.barberId===9 && p.serviceIds.join(',')==='11,12' && p.token==='token'));
  assert.ok(calls.every(p=>p.signal instanceof AbortSignal));
  assert.equal(states.at(-1).complete,true);
  assert.equal(states.at(-1).days[2].status,'empty');
  assert.equal(states.at(-1).days.filter(day=>day.status==='available').length,6);
  assert.ok(states.at(-1).days.every(day=>!Object.hasOwn(day,'busy') && !Object.hasOwn(day,'customer')));
});
test('at most two network requests in flight', async () => {
  const pending = [];
  const states = [];
  const stop = watchAvailabilityWeek({...input, loader:p=>new Promise(resolve=>pending.push({p,resolve}))}, state=>states.push(state));
  await tick();
  assert.equal(pending.length,2);
  assert.equal(states[0].complete,false);
  for(let i=0;i<7;i++){
    pending[i].resolve(response(pending[i].p.date));
    await tick();
    assert.ok(pending.length<=Math.min(i+3,7));
  }
  assert.equal(pending.length,7);
  assert.equal(states.at(-1).complete,true);
  stop();
});
test('day API error stays error, other days continue; no false free-slot claim', async () => {
  const states=[];
  const stop=watchAvailabilityWeek({...input,loader:async p=>{
    if(p.date===dates[3]) throw new Error('Network unavailable');
    return response(p.date,[]);
  }},state=>states.push(state));
  await tick(); stop();
  assert.equal(states.at(-1).days[3].status,'error');
  assert.equal(states.at(-1).days.filter(d=>d.status==='empty').length,6);
  assert.equal(states.at(-1).complete,true);
});
test('cancel aborts requests, suppresses late success and error, and stops queue', async () => {
  const pending=[]; const states=[];
  const stop=watchAvailabilityWeek({...input,loader:p=>new Promise((resolve,reject)=>pending.push({p,resolve,reject}))},state=>states.push(state));
  await tick(); assert.equal(pending.length,2);
  const count=states.length;
  stop();
  assert.equal(pending[0].p.signal.aborted,true);
  pending[0].resolve(response(dates[0]));
  pending[1].reject(new Error('late'));
  await tick();
  assert.equal(states.length,count);
  assert.equal(pending.length,2);
});
test('cancel before microtask does not call API or publish', async () => {
  let calls=0; const states=[];
  const stop=watchAvailabilityWeek({...input,loader:async p=>{calls++;return response(p.date)}},s=>states.push(s));
  stop(); await tick(); assert.equal(calls,0); assert.deepEqual(states,[]);
});
test('new service/week request owns state independently of canceled old request', async () => {
  const pending=[]; const old=[]; const fresh=[];
  const load=p=>new Promise(resolve=>pending.push({p,resolve}));
  const first=watchAvailabilityWeek({...input,loader:load},s=>old.push(s));
  await tick(); first();
  const second=watchAvailabilityWeek({...input,dates:dates.slice(7),serviceIds:[13],loader:async p=>response(p.date)},s=>fresh.push(s));
  await tick(); second();
  const oldCount=old.length;
  pending.forEach(x=>x.resolve(response(x.p.date)));
  await tick();
  assert.equal(old.length,oldCount);
  assert.deepEqual(fresh.at(-1).days.map(d=>d.date),dates.slice(7));
  assert.equal(fresh.at(-1).complete,true);
});

test('actual public slot adapter enforces day and service GET contract for seven days', async () => {
  const previousFetch = globalThis.fetch;
  const requests=[];
  globalThis.fetch = async (url, options) => {
    const parsed=new URL(url);
    assert.equal(parsed.pathname, '/api/bookings/available-slots');
    assert.equal(parsed.searchParams.get('barber_id'), '9');
    assert.equal(parsed.searchParams.get('service_ids'), '11,12');
    assert.equal(new Headers(options.headers).get('Authorization'),'Bearer token');
    requests.push(parsed.searchParams.get('date'));
    return new Response(JSON.stringify({
      date:parsed.searchParams.get('date'),duration:30,working:true,
      total_price:'35000.00',
      slots:[{start:'13:00',end:'13:30'}],
      candidates:[{start:'12:55',end:'13:25',available:false},{start:'13:00',end:'13:30',available:true}],
      busy:[{customer_name:'private',start:'12:55',end:'13:25'}]
    }));
  };
  try {
    const states=[];
    const stop=watchAvailabilityWeek(input,s=>states.push(s));
    await tick(); stop();
    assert.deepEqual(requests.sort(), dates.slice(0,7));
    assert.equal(states.at(-1).complete,true);
    assert.deepEqual(states.at(-1).days.map(d=>[d.status,d.count,d.first]),Array(7).fill(0).map(()=>['available',1,'13:00']));
    assert.ok(states.at(-1).days.every(d=>!('busy' in d) && !('customer_name' in d) && !('total_price' in d)));
  } finally { globalThis.fetch=previousFetch; }
});
