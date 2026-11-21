import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  alternativeDates, collectCancellationAlternatives,
} from '../src/pages/user/bookings/cancellationAlternatives.js';

const booking = { id: 81, status: 'cancelled', startsAt: '2030-06-12T08:00:00Z',
  barber: { id: 7 }, services: [{ id: 14 }, { id: 15 }] };
const nowMs = Date.parse('2030-06-11T08:00:00Z');
const sample = (date, slots = [{ time: '10:00' }]) => ({ date, working: true, slots });
const lookup = (b = booking, args = {}) => collectCancellationAlternatives(b, {
  nowMs, fetchSlots: ({ date }) => Promise.resolve(sample(date)), ...args,
});

test('v102 refuses an active booking when status is known', async () => {
  let called = 0;
  const response = await lookup({ ...booking, status: 'confirmed' }, {
    fetchSlots: () => { called++; throw Error('must not fetch'); },
  });
  assert.equal(called, 0);
  assert.deepEqual(response, { slots: [], unavailable: true, reason: 'not_cancelled' });
});

test('v102 rejects pending or completed appointment alternatives', async () => {
  for (const status of ['pending', 'completed', 'rejected']) {
    const result = await lookup({ ...booking, status });
    assert.equal(result.reason, 'not_cancelled');
  }
});

test('v102 rejects local-time timestamps without an explicit timezone', () => {
  assert.deepEqual(alternativeDates({ ...booking, startsAt: '2030-06-12T13:00:00' }, nowMs), []);
  assert.deepEqual(alternativeDates({ ...booking, startsAt: '2030-06-12' }, nowMs), []);
});

test('v102 ignores unparseable and out-of-range appointment timestamps', () => {
  assert.deepEqual(alternativeDates({ ...booking, startsAt: '2030-02-31T13:00:00Z' }, nowMs), []);
  assert.deepEqual(alternativeDates({ ...booking, startsAt: '2030-06-12T24:00:00Z' }, nowMs), []);
  assert.deepEqual(alternativeDates({ ...booking, startsAt: '2030-06-12T12:99:00Z' }, nowMs), []);

  assert.deepEqual(alternativeDates({ ...booking, startsAt: 'junk' }, nowMs), []);
});

test('v102 rejects an invalid but finite current timestamp safely', async () => {
  await assert.rejects(lookup(booking, { nowMs: 9e20 }), /Hozirgi vaqt yaroqsiz/);
});

test('v102 lists the nearest times even when the server order is reversed', async () => {
  const result = await lookup(booking, {
    limit: 2,
    fetchSlots: ({ date }) => sample(date, [
      { time: '18:00' }, { time: '14:30' }, { time: '10:00' }, { time: '09:30' },
    ]),
  });
  assert.deepEqual(result.slots, [
    { date: '2030-06-12', time: '09:30' }, { date: '2030-06-12', time: '10:00' },
  ]);
});

test('v102 does not corrupt shared raw server slots when sorting', async () => {
  const source = [{ time: '11:00' }, { time: '09:00' }];
  await lookup(booking, { limit: 1, fetchSlots: ({ date }) => sample(date, source) });
  assert.deepEqual(source, [{ time: '11:00' }, { time: '09:00' }]);
});

test('v102 never accepts absurdly large API slot collections as valid', async () => {
  const tooMany = Array.from({ length: 289 }, (_, i) => ({ time: '10:00', id: i }));
  await assert.rejects(lookup(booking, {
    fetchSlots: ({ date }) => sample(date, tooMany),
  }), /tekshirib bo‘lmadi/);
});

test('v102 malformed large response only marks that day as partial', async () => {
  const result = await lookup(booking, { limit: 1,
    fetchSlots: ({ date }) => date === '2030-06-12'
      ? sample(date, Array.from({ length: 289 }, () => ({ time: '11:00' })))
      : sample(date),
  });
  assert.equal(result.partial, true);
  assert.deepEqual(result.slots, [{ date: '2030-06-13', time: '10:00' }]);
});

test('v102 rejects non-boolean accepting_bookings metadata', async () => {
  await assert.rejects(lookup(booking, {
    fetchSlots: ({ date }) => ({ ...sample(date), accepting_bookings: 'true' }),
  }), /tekshirib bo‘lmadi/);
});

test('v102 rejects invalid duration metadata rather than inventing free slots', async () => {
  for (const duration of [0, 7, 1205, '30']) {
    await assert.rejects(lookup(booking, {
      fetchSlots: ({ date }) => ({ ...sample(date), duration }),
    }), /tekshirib bo‘lmadi/);
  }
});

test('v102 validates optional end times against advertised duration', async () => {
  const result = await lookup(booking, { limit: 1,
    fetchSlots: ({ date }) => ({ ...sample(date, [
      { time: '09:00', endTime: '09:15' },
      { time: '09:30', endTime: '09:00' },
      { time: '10:00', endTime: '10:30' },
    ]), duration: 30 }),
  });
  assert.deepEqual(result.slots, [{ date: '2030-06-12', time: '10:00' }]);
});

test('v102 accepts a valid slot ending at midnight', async () => {
  const result = await lookup(booking, { limit: 1,
    fetchSlots: ({ date }) => ({ ...sample(date, [{ time: '23:30', endTime: '24:00' }]), duration: 30 }),
  });
  assert.deepEqual(result.slots, [{ date: '2030-06-12', time: '23:30' }]);
});

test('v102 preserves cancellation of a resolved but aborted network request', async () => {
  const controller = new AbortController();
  await assert.rejects(lookup(booking, { signal: controller.signal,
    fetchSlots: async ({ date }) => { controller.abort(); return sample(date); },
  }), { name: 'AbortError' });
});

test('v102 never returns previously fetched slots when aborted on the second day', async () => {
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(lookup(booking, { signal: controller.signal,
    fetchSlots: async ({ date }) => {
      count++;
      if (count === 2) controller.abort();
      return sample(date, count === 1 ? [] : [{ time: '10:00' }]);
    },
  }), { name: 'AbortError' });
});

test('v102 the customer UI uses the server-verified cancelled booking, not stale pre-request data', async () => {
  const source = await readFile(new URL('../src/pages/user/Bookings.jsx', import.meta.url), 'utf8');
  assert.match(source, /const verifiedCancellation = validateCancellation\(response, cancelling\.id\)/);
  assert.match(source, /setCancelledForAlternatives\(verifiedCancellation\)/);
  assert.doesNotMatch(source, /setCancelledForAlternatives\(cancelling\)/);
});

test('v102 alternatives UI subscribes to session changes, without automatically booking', async () => {
  const source = await readFile(new URL('../src/pages/user/bookings/CancellationAlternatives.jsx', import.meta.url), 'utf8');
  assert.match(source, /subscribeSession\(/);
  assert.match(source, /current\.token !== token/);
  assert.match(source, /onClose\(\)/);
  assert.doesNotMatch(source, /createBooking\(/);
});

test('v102 never suggests a slot explicitly labelled unavailable', async () => {
  const result = await lookup(booking, { limit: 1,
    fetchSlots: ({ date }) => sample(date, [{ time: '09:00', available: false }, { time: '09:30', available: true }]),
  });
  assert.deepEqual(result.slots, [{ date: '2030-06-12', time: '09:30' }]);
});
