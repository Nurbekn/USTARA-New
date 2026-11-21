import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(url) {
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    source = source.replace(match[0], `from "${await load(new URL(match[1], url))}"`);
  }
  return moduleUrl(source);
}
const { createBooking } = await import(await load(new URL('../src/pages/user/barber/createBooking.js', import.meta.url)));
const initialFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = initialFetch; });
const selection = { barberId: 23, serviceId: 34, date: '2030-01-07', time: '10:00', token: 'test-token' };
const booking = { message: 'Bron tasdiqlandi', data: { id: 61, barber_id: 23, service_id: 34,
  booking_time: '2030-01-07T05:00:00.000Z', duration_minutes: 45, status: 'confirmed' } };
test('quoted duration and price are sent as confirmation guards only', async () => {
  globalThis.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.expected_duration_minutes, 45);
    assert.equal(body.expected_total_price, '70000.00');
    assert.equal(body.duration_minutes, undefined);
    assert.equal(body.total_price, undefined);
    // Server receipt must include the authoritative quoted amount for success.
    return new Response(JSON.stringify({...booking, data:{...booking.data,total_price:'70000.00'}}), { status: 201 });
  };
  await createBooking({ ...selection, expectedDurationMinutes: 45, expectedTotalPrice: '70000.00' });
});
for (const value of [0, -5, 7, 45.5, 1205, '45', null, NaN, Infinity]) {
  test('invalid duration is rejected without POST: ' + String(value), async () => {
    let requests = 0;
    globalThis.fetch = () => { requests++; throw Error('unexpected POST'); };
    await assert.rejects(createBooking({ ...selection, expectedDurationMinutes: value }), /davomiyligini qayta tekshiring/);
    assert.equal(requests, 0);
  });
}
test('a 409 duration change surfaces a server conflict instead of falsely reporting success', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'duration_changed', message: 'Xizmat davomiyligi o‘zgargan' }), { status: 409 });
  await assert.rejects(createBooking({ ...selection, expectedDurationMinutes: 30 }), { status: 409, code: 'duration_changed' });
});
