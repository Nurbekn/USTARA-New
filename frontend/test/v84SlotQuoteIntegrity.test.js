import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

// Same module-loading method as availableSlots.test.js, without Vite.
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function esm(url) {
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    source = source.replace(match[0], `from "${await esm(new URL(match[1], url))}"`);
  }
  return asUrl(source);
}
const { loadAvailableSlots } = await import(await esm(new URL('../src/pages/user/barber/availableSlots.js', import.meta.url)));
const initialFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = initialFetch; });
const request = { barberId: 31, serviceIds: [9, 10], date: '2032-02-29' };
function success(patch = {}) {
  return { date: request.date, duration: 30, working: true, accepting_bookings: true,
    service_ids: [9, 10], total_price: '65000.50',
    slots: [{ start: '09:35', end: '10:05' }],
    candidates: [{ start: '09:30', end: '10:00', available: false }, { start: '09:35', end: '10:05', available: true }],
    ...patch };
}
function reply(data) {
  let called = 0;
  globalThis.fetch = async () => { called++; return new Response(JSON.stringify(data)); };
  return () => called;
}

test('v84: accepted server response hides occupied slots and keeps server quote unchanged', async () => {
  const calls = reply(success());
  const result = await loadAvailableSlots(request);
  assert.equal(calls(), 1);
  assert.deepEqual(result.slots.map(s => [s.time, s.available]), [['09:35', true]]);
  assert.equal(result.total_price, '65000.50');
  assert.deepEqual(result.service_ids, [9, 10]);
});

test('v84: end-of-day 24:00 allowed only as slot end', async () => {
  reply(success({ duration: 5, slots: [{start:'23:55',end:'24:00'}],
    candidates: [{start:'23:55',end:'24:00',available:true}] }));
  const result = await loadAvailableSlots(request);
  assert.equal(result.slots[0].endTime, '24:00');
});

for (const [label, change] of [
  ['barber ID above PostgreSQL int4', {barberId:2147483648}],
  ['negative barber ID', {barberId:-4}],
  ['invalid service ID above PostgreSQL int4', {serviceIds:[9,2147483648]}],
  ['decimal service ID', {serviceIds:[9,10.5]}],
  ['duplicate services', {serviceIds:[9,9]}],
  ['impossible leap day', {date:'2030-02-29'}],
  ['April 31', {date:'2032-04-31'}],
  ['invalid month', {date:'2032-13-01'}],
  ['unsafe date object', {date:new Date('2032-02-29')}],
]) {
  test(`v84: ${label} rejected before network`, async () => {
    const calls = reply(success());
    await assert.rejects(loadAvailableSlots({...request,...change}));
    assert.equal(calls(), 0);
  });
}
for (const [label, change] of [
  ['duration shorter than minimum', {duration:0}],
  ['duration not five-minute aligned', {duration:31}],
  ['duration too long', {duration:1205}],
  ['duration text', {duration:'30'}],
  ['service IDs in wrong order', {service_ids:[10,9]}],
  ['extra service in response', {service_ids:[9,10,11]}],
  ['negative quote', {total_price:'-1.00'}],
  ['non-finite quote string', {total_price:'Infinity'}],
  ['too many fractional digits', {total_price:'12.345'}],
  ['zero quote', {total_price:'0.00'}],
  ['unknown status for bookings', {accepting_bookings:'true'}],
  ['unparseable slots array', {slots:null}],
]) {
  test(`v84: ${label} fails closed`, async () => {
    reply(success(change));
    await assert.rejects(loadAvailableSlots(request));
  });
}
for (const [label, change] of [
  ['unavailable slot presented as free', {candidates:[{start:'09:35',end:'10:05',available:false}]}],
  ['free slot absent from canonical slots', {candidates:[{start:'09:40',end:'10:10',available:true}]}],
  ['duplicated candidate', {candidates:[{start:'09:35',end:'10:05',available:true},{start:'09:35',end:'10:05',available:true}]}],
  ['duplicated canonical slot', {slots:[{start:'09:35',end:'10:05'},{start:'09:35',end:'10:05'}]}],
  ['time outside five-minute grid', {candidates:[{start:'09:32',end:'10:02',available:true}]}],
  ['candidate boolean as string', {candidates:[{start:'09:35',end:'10:05',available:'true'}]}],
  ['negative slot length', {slots:[{start:'10:00',end:'09:30'}]}],
  ['start at 24:00', {slots:[{start:'24:00',end:'24:30'}]}],
  ['claimed non-working day has slots', {working:false}],
  ['bookings paused but slot selectable', {accepting_bookings:false}],
  ['non-working day has only blocked candidates', {working:false, slots:[],candidates:[{start:'09:30',end:'10:00',available:false}]}],
]) {
  test(`v84: ${label} never reaches booking UI`, async () => {
    reply(success(change));
    await assert.rejects(loadAvailableSlots(request));
  });
}

test('v84: old single-service response without candidates or price still displays canonical slots', async () => {
  reply({ date:request.date,duration:30,working:true,slots:[{start:'10:05',end:'10:35'}] });
  const data = await loadAvailableSlots({barberId:31,serviceId:9,date:request.date});
  assert.equal(data.slots[0].available,true);
});

test('v84: empty non-working response remains valid', async () => {
  reply({ date:request.date,duration:30,working:false,slots:[],candidates:[],accepting_bookings:false,service_ids:[9,10],total_price:'65000.50' });
  const data = await loadAvailableSlots(request);
  assert.deepEqual(data.slots,[]);
});

test('v84: candidate count cannot exceed 24 hours at five-minute intervals', async () => {
  const over = Array.from({length:289}, (_,i)=>({start:'09:35',end:'10:05',available:false,index:i}));
  reply(success({candidates:over}));
  await assert.rejects(loadAvailableSlots(request));
});
