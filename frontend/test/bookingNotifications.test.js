import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingStatusItems } from '../src/pages/user/bookings/notifications.js';
test('booking inbox only contains actual booking statuses', () => {
  const items = bookingStatusItems([
    { id: 9, status: 'confirmed', startsAt: '2026-12-12T10:00:00+05:00', barber: { first_name: 'Ali' } },
    { id: 4, status: 'unknown', startsAt: '2026-12-11T10:00:00+05:00' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 9);
  assert.match(items[0].title, /tasdiqlandi/);
  assert.equal(items[0].url, '/user/bookings?booking=9');
});
test('empty list never fabricates notifications', () => {
  assert.deepEqual(bookingStatusItems([]), []);
  assert.deepEqual(bookingStatusItems(undefined), []);
});
