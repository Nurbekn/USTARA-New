import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertOtp, secondsUntil, serverDeadline, createPhoneChangeApi } from '../src/components/phoneChange/model.js';
test('OTP paste preserves leading zero, strips separators and positions focus', () => {
  assert.deepEqual(insertOtp(Array(5).fill(''), 2, '0 1-234'), { digits: ['0', '1', '2', '3', '4'], focus: 4 });
  assert.deepEqual(insertOtp(['1', '2', '', '', ''], 2, '7'), { digits: ['1', '2', '7', '', ''], focus: 3 });
  assert.deepEqual(insertOtp(['1', '2', '3', '4', '5'], 2, ''), { digits: ['1', '2', '', '4', '5'], focus: 2 });
});
test('server time corrects clock skew; expired cooldown never goes negative', () => {
  assert.equal(serverDeadline('2026-01-01T00:01:00Z', '2026-01-01T00:00:00Z', 100), 60100);
  assert.equal(secondsUntil(60100, 60101), 0);assert.equal(secondsUntil(60100, 100), 60);
  assert.equal(serverDeadline(null, null), 0);
});
test('phone-change API requires a session and isolates endpoints from signup/reset', async () => {
  const calls = [], controller = new AbortController();
  const api = createPhoneChangeApi({ getToken: () => 'test-auth', request: async (...args) => { calls.push(args); return { code: 'test' }; } });
  for (const action of ['start', 'choose', 'status', 'resend', 'verify']) await api(action, { sessionToken: 'test' }, controller.signal);
  assert.deepEqual(calls.map(c => c[1]), ['start', 'choose', 'status', 'resend', 'verify'].map(a => '/api/auth/phone-change/' + a));
  assert.ok(calls.every(([method, , options]) => method === 'POST' && options.token === 'test-auth' && options.signal === controller.signal));
  await assert.rejects(api('registration', {}));
  await assert.rejects(createPhoneChangeApi({ request: () => assert.fail(), getToken: () => null })('start', {}));
});
