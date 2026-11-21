import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeBookings, rankBarbers } from '../src/pages/user/explore/homeModel.js';
const origin = { lat: 41.3, lng: 69.2 };
test('kuzatilganlar avval, keyin masofa; manzilsizlar oxirida', () => {
  const list = [{id:1,location:{lat:42,lng:70}},{id:2,location:origin},{id:3,location:{lat:43,lng:71}},{id:4}];
  assert.deepEqual(rankBarbers(list,['barber:3'],origin).map(b=>b.id),[3,2,1,4]);
  assert.deepEqual(list.map(b=>b.id),[1,2,3,4]);
});
test('geolokatsiya bo‘lmasa soxta masofa ishlatilmaydi', () => {
  assert.deepEqual(rankBarbers([{id:2},{id:1}],['barber:2'],null).map(b=>b.id),[2,1]);
});
test('faol bronlar yaqin vaqtdan; tugagan va bekor qilinganlar yo‘q', () => {
  const now=Date.parse('2026-11-18T10:00:00Z');
  const bookings=[{id:1,status:'confirmed',startsAt:'2026-11-18T12:00:00Z'},{id:2,status:'confirmed',startsAt:'2026-11-18T09:45:00Z',endsAt:'2026-11-18T10:15:00Z'},{id:3,status:'cancelled',startsAt:'2026-11-18T11:00:00Z'},{id:4,status:'pending',startsAt:'2026-11-17T09:00:00Z',endsAt:'2026-11-17T10:00:00Z'}];
  assert.deepEqual(activeBookings(bookings,now).map(b=>b.id),[2,1]);assert.deepEqual(activeBookings([],now),[]);
});
