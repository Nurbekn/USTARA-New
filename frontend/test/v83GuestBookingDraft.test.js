import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DRAFT_KEY, DRAFT_TTL_MS, clearBookingDraftForBarber,
  readBookingDraft, saveBookingDraft, restoreBookingDraft,
} from '../src/pages/user/barber/bookingDraft.js';

const initial = { barberId: 7, serviceIds: [4, 5], date: '2032-02-29', time: '10:05' };
const start = 12345678;
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}
function makeDraft(s = memoryStorage(), input = initial, now = start) {
  assert.equal(saveBookingDraft(input, s, now), true);
  return s;
}
function writeTampered(s, patch) {
  const obj = JSON.parse(s.getItem(DRAFT_KEY));
  s.setItem(DRAFT_KEY, JSON.stringify({ ...obj, ...patch }));
}

test('v83: restored draft preserves ordered multiple services', () => {
  const s = makeDraft();
  const d = readBookingDraft(s, start);
  assert.deepEqual(restoreBookingDraft(d, 7, [5, 4, 6], ['2032-02-29']), d);
  assert.deepEqual(d.serviceIds, [4, 5]);
});

test('v83: draft cannot cross to a different barber', () => {
  const s = makeDraft();
  assert.equal(restoreBookingDraft(readBookingDraft(s, start), 8, [4, 5], ['2032-02-29']), null);
  assert.equal(clearBookingDraftForBarber(8, s, start), false);
  assert.notEqual(readBookingDraft(s, start), null);
});

test('v83: an unavailable service invalidates restored selection', () => {
  const d = readBookingDraft(makeDraft(), start);
  assert.equal(restoreBookingDraft(d, 7, [4], ['2032-02-29']), null);
});

test('v83: expired booking day is not revived although storage TTL remains valid', () => {
  const d = readBookingDraft(makeDraft(), start);
  assert.equal(restoreBookingDraft(d, 7, [4, 5], ['2032-03-01']), null);
});

test('v83: valid day outside the displayed 14 days is not allowed', () => {
  const d = readBookingDraft(makeDraft(), start);
  assert.equal(restoreBookingDraft(d, 7, [4, 5], []), null);
});

test('v83: no services or malformed candidate never restores', () => {
  const d = readBookingDraft(makeDraft(), start);
  assert.equal(restoreBookingDraft(d, 7, [], ['2032-02-29']), null);
  assert.equal(restoreBookingDraft({ ...d, serviceIds: null }, 7, [4, 5], ['2032-02-29']), null);
  assert.equal(restoreBookingDraft({ ...d, serviceIds: [4, -2] }, 7, [4, 5], ['2032-02-29']), null);
});

test('v83: deselecting last service clears only this barber draft', () => {
  const s = makeDraft();
  assert.equal(clearBookingDraftForBarber(7, s, start), true);
  assert.equal(s.getItem(DRAFT_KEY), null);
});

test('v83: clearing twice is safe, without deleting other barber draft', () => {
  const s = makeDraft();
  assert.equal(clearBookingDraftForBarber(8, s, start), false);
  assert.equal(clearBookingDraftForBarber(7, s, start), true);
  assert.equal(clearBookingDraftForBarber(7, s, start), false);
});

test('v83: tampered extra phone field is rejected and cleared', () => {
  const s = makeDraft(); writeTampered(s, { phone: '+998999999999' });
  assert.equal(readBookingDraft(s, start), null);
  assert.equal(s.getItem(DRAFT_KEY), null);
});

test('v83: tampered JWT/token and price are never returned', () => {
  const s = makeDraft(); writeTampered(s, { token: 'secret', quote: 500 });
  assert.equal(readBookingDraft(s, start), null);
});

test('v83: arrays and primitives cannot masquerade as draft object', () => {
  const s = makeDraft();
  for (const raw of ['[]', 'null', 'false', '7', '"string"', '{}']) {
    s.setItem(DRAFT_KEY, raw);
    assert.equal(readBookingDraft(s, start), null, raw);
  }
});

test('v83: oversized storage payload is ignored and cleared', () => {
  const s = makeDraft(); s.setItem(DRAFT_KEY, 'x'.repeat(2049));
  assert.equal(readBookingDraft(s, start), null);
  assert.equal(s.getItem(DRAFT_KEY), null);
});

test('v83: non-integer and invalid clock timestamps are rejected', () => {
  const s = memoryStorage();
  for (const now of [-1, NaN, Infinity, 20.25, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(saveBookingDraft(initial, s, now), false);
  }
  makeDraft(s);
  for (const createdAt of [-1, 1.5, start + 1]) {
    writeTampered(s, { createdAt });
    assert.equal(readBookingDraft(s, start), null);
    makeDraft(s);
  }
});

test('v83: arbitrary time outside 5 minute grid is rejected', () => {
  const s = memoryStorage();
  for (const time of ['10:02', '24:00', '10:60', '10:5', '10:000', 1005, null]) {
    // null means no selected time, intentionally normalized to empty string.
    if (time === null) continue;
    assert.equal(saveBookingDraft({ ...initial, time }, s, start), false, String(time));
  }
  assert.equal(saveBookingDraft({ ...initial, time: '23:55' }, s, start), true);
});

test('v83: valid leap date accepted, invalid nonleap date rejected', () => {
  const s = memoryStorage();
  assert.equal(saveBookingDraft(initial, s, start), true);
  assert.equal(saveBookingDraft({ ...initial, date: '2030-02-29' }, s, start), false);
});

test('v83: default storage getter throwing must not throw', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.doesNotThrow(() => readBookingDraft());
    assert.equal(saveBookingDraft(initial), false);
    assert.equal(clearBookingDraftForBarber(7), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});

test('v83: missing session storage never reports save success', () => {
  assert.equal(saveBookingDraft(initial, null, start), false);
  assert.equal(readBookingDraft(null, start), null);
});

test('v83: service selection mutation after saving cannot change stored draft', () => {
  const s = memoryStorage(), ids = [4, 5];
  assert.equal(saveBookingDraft({ ...initial, serviceIds: ids }, s, start), true);
  ids.push(6);
  assert.deepEqual(readBookingDraft(s, start).serviceIds, [4, 5]);
});

test('v83: limits selection to 20 and rejects 21st', () => {
  const s = memoryStorage();
  const ids = Array.from({ length: 20 }, (_, n) => n + 1);
  assert.equal(saveBookingDraft({ ...initial, serviceIds: ids }, s, start), true);
  assert.equal(saveBookingDraft({ ...initial, serviceIds: [...ids, 21] }, s, start), false);
});

test('v83: saving same draft cannot silently renew five-minute lifetime', () => {
  const s = makeDraft();
  assert.equal(saveBookingDraft(initial, s, start + DRAFT_TTL_MS - 1), true);
  assert.equal(readBookingDraft(s, start + DRAFT_TTL_MS + 1), null);
});

test('v83: updated selection renews timestamp but cannot reuse prior fields', () => {
  const s = makeDraft();
  saveBookingDraft({ ...initial, time: '' }, s, start + 1000);
  assert.equal(readBookingDraft(s, start + 1000).createdAt, start + 1000);
  assert.equal(readBookingDraft(s, start + 1000).time, '');
});

test('v83: component wires draft validation, cleanup and 20-service limit', async () => {
  const source = await readFile(new URL('../src/pages/user/barber/InlineBooking.jsx', import.meta.url), 'utf8');
  assert.match(source, /restoreBookingDraft\(savedDraft, barber\.id, details\.services\.map\(item => item\.id\), dates\)/);
  assert.match(source, /clearBookingDraftForBarber\(barber\.id\)/);
  assert.match(source, /serviceIds\.length >= 20/);
  assert.match(source, /clearBookingDraft\(\)/); // still clears on successful booking
});
