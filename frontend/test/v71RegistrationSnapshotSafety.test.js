import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

const toUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(path) {
  let source = (await readFile(path, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const [, relative] of source.matchAll(/from "([^"]+)"/g)) {
    source = source.replace(`from "${relative}"`, `from "${await load(new URL(relative, path))}"`);
  }
  return toUrl(source);
}
const reg = await import(await load(new URL('../src/pages/auth/utils/registration.js', import.meta.url)));
const now = Date.now();
const base = { role: 'customer', phone: '+998901234567', sessionToken: 'a'.repeat(64),
  stage: 'otp', sessionExpiresAt: now + 600000, resendAt: now + 30000,
  otpExpiresAt: now + 60000, deliveryPending: false };
const verified = { ...base, stage: 'verified', completionExpiresAt: now + 400000 };
const botPending = { ...base, otpExpiresAt: null, deliveryPending: true,
  botUrl: 'https://t.me/ustara_booking_bot', deliveryRetryAt: now + 10000 };
const accepts = v => reg.validRegistrationSnapshot(v, now);
const apply = (current, incoming) => reg.canApplyRegistrationSnapshot(current, incoming, now);

test('v71 01: valid OTP and verified snapshots remain loadable', () => {
  assert.equal(accepts(base), true); assert.equal(accepts(verified), true);
});
test('v71 02: old pending-delivery snapshots remain compatible', () => {
  const { deliveryRetryAt: _unused, ...legacy } = botPending;
  assert.equal(accepts(legacy), true);
});
test('v71 03: incoming snapshot cannot switch customer to barber', () => {
  assert.equal(apply(base, { ...base, role: 'barber', specialty: 'stylist' }), false);
});
test('v71 04: incoming snapshot cannot change verified phone identity', () => {
  assert.equal(apply(verified, { ...verified, phone: '+998911234567' }), false);
});
test('v71 05: incoming snapshot cannot switch barber specialty', () => {
  const current = { ...base, role: 'barber', specialty: 'barber' };
  assert.equal(apply(current, { ...current, specialty: 'stylist' }), false);
});
test('v71 06: session expiry cannot move backwards', () => {
  assert.equal(apply(base, { ...base, sessionExpiresAt: base.sessionExpiresAt - 1000 }), false);
});
test('v71 07: resend cooldown cannot move backwards', () => {
  assert.equal(apply(verified, { ...verified, resendAt: verified.resendAt - 1 }), false);
});
test('v71 08: OTP expiry cannot move backwards', () => {
  assert.equal(apply(base, { ...base, otpExpiresAt: base.otpExpiresAt - 1 }), false);
});
test('v71 09: delivered OTP cannot regress to pending delivery', () => {
  assert.equal(apply(base, botPending), false);
});
test('v71 10: delivery retry time cannot move backwards', () => {
  assert.equal(apply(botPending, { ...botPending, deliveryRetryAt: botPending.deliveryRetryAt - 1 }), false);
});
test('v71 11: pending delivery may advance to delivered OTP', () => {
  assert.equal(apply(botPending, base), true);
});
test('v71 12: verification may advance without changing identity', () => {
  assert.equal(apply(base, verified), true);
});
test('v71 13: verified stage may not roll back to OTP', () => {
  assert.equal(apply(verified, base), false);
});
test('v71 14: verified completion expiration must be in future', () => {
  assert.equal(accepts({ ...verified, completionExpiresAt: now }), false);
});
test('v71 15: non-integer, negative and infinite timestamps rejected', () => {
  for (const bad of [-1, 0, NaN, Infinity, now + 0.5, '123']) {
    assert.equal(accepts({ ...base, resendAt: bad }), false);
  }
});
test('v71 16: malformed block metadata rejected', () => {
  assert.equal(accepts({ ...base, block: { adminRequired: 'yes', until: null } }), false);
  assert.equal(accepts({ ...base, block: { adminRequired: false, until: 'tomorrow' } }), false);
  assert.equal(accepts({ ...base, block: { adminRequired: true, until: null } }), true);
});
test('v71 17: invalid bot domain rejected', () => {
  assert.equal(accepts({ ...botPending, botUrl: 'https://t.me.attacker.invalid/ustara_booking_bot' }), false);
});
test('v71 18: stage delivery mode must have explicit boolean', () => {
  assert.equal(accepts({ ...base, deliveryPending: 'false' }), false);
  assert.equal(accepts({ ...base, deliveryPending: undefined }), false);
});
test('v71 19: arbitrary objects and arrays are not registration snapshots', () => {
  assert.equal(accepts([]), false);
  assert.equal(accepts(Object.create(null)), false);
  assert.equal(accepts(null), false);
});
test('v71 20: benign newer OTP update continues to be accepted', () => {
  assert.equal(apply(base, { ...base, resendAt: base.resendAt + 1000,
    otpExpiresAt: base.otpExpiresAt + 1000 }), true);
});
