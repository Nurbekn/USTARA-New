import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { canonicalProfileNames, normalizeProfilePart, profilePartError } from '../src/utils/profileIdentity.js';
import { hasProfileName, profileForSession } from '../src/pages/auth/profileCompletion.js';
import { profileName } from '../src/utils/profileName.js';

const urlFor = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(url) {
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const [, relative] of source.matchAll(/from "([^"]+)"/g)) {
    source = source.replace(`from "${relative}"`, `from "${await load(new URL(relative,url))}"`);
  }
  return urlFor(source);
}
const reg = await import(await load(new URL('../src/pages/auth/utils/registration.js', import.meta.url)));
const now = Date.now();
const base = { role: 'customer', phone: '+998901234567', sessionToken: 'a'.repeat(64),
  stage: 'otp', sessionExpiresAt: now + 600000, resendAt: now + 30000,
  otpExpiresAt: now + 60000, deliveryPending: false };
const verified = { ...base, stage: 'verified', completionExpiresAt: now + 400000 };

test('v70 #1 NFC canonicalization keeps a single composed Unicode name', () => {
  assert.equal(normalizeProfilePart('  E\u0301lyor  '), '\u00c9lyor');
});
test('v70 #2 multiple whitespace runs collapse before profile save', () => {
  assert.deepEqual(canonicalProfileNames('  Ali\tJon  ', '  Valiev\nO\u02bbg\u02bbli  '),
    { firstName: 'Ali Jon', lastName: 'Valiev O\u02bbg\u02bbli' });
});
test('v70 #3 profile names reject invisible control characters', () => {
  assert.ok(profilePartError('Ali\u200bJon'));
  assert.ok(profilePartError('Ali\x00'));
});
test('v70 #4 profile names reject special punctuation and numeric-only names', () => {
  assert.ok(profilePartError('123'));
  assert.ok(profilePartError('Ali<script>'));
});
test('v70 #5 length measured in codepoints not UTF-16 units', () => {
  assert.equal(profilePartError('O'.repeat(80)), '');
  assert.ok(profilePartError('O'.repeat(81)));
});
test('v70 #6 invalid non-string names throw structured field errors', () => {
  assert.throws(() => canonicalProfileNames(null, 100), e => !!e.fields.firstName && !!e.fields.lastName);
});
test('v70 #7 incomplete profile with malformed name is not considered onboarded', () => {
  assert.equal(hasProfileName({ firstName: 'Ali\u200b', lastName: 'Vali' }), false);
});
test('v70 #8 valid barber profile beats incomplete stale session profile', () => {
  const result = profileForSession({ role: 'barber', profile: { first_name: 'Old', last_name: '' } },
    { first_name: 'O\u02bbtkir', last_name: 'Aliyev' });
  assert.equal(result.firstName, 'O\u02bbtkir');
  assert.equal(result.lastName, 'Aliyev');
});
test('v70 #9 displayed names have canonical Unicode whitespace', () => {
  assert.equal(profileName({ first_name: ' Ali  Jon ', last_name: ' Valiev ' }), 'Ali Jon Valiev');
});
test('v70 #10 valid same-token cross-tab OTP update is accepted', () => {
  assert.equal(reg.canApplyRegistrationSnapshot(base, { ...base, resendAt: base.resendAt + 3000 }, now), true);
});
test('v70 #11 verified registration cannot roll back to OTP via other tab', () => {
  assert.equal(reg.canApplyRegistrationSnapshot(verified, base, now), false);
});
test('v70 #12 earlier verified completion deadline replay is ignored', () => {
  assert.equal(reg.canApplyRegistrationSnapshot(verified, { ...verified, completionExpiresAt: verified.completionExpiresAt - 5000 }, now), false);
});
test('v70 #13 replayed earlier resend cooldown is rejected', () => {
  assert.equal(reg.canApplyRegistrationSnapshot({ ...base, resendAt: base.resendAt + 6000 }, base, now), false);
});
test('v70 #14 unrelated registration token cannot replace current identity', () => {
  assert.equal(reg.canApplyRegistrationSnapshot(base, { ...base, sessionToken: 'b'.repeat(64) }, now), false);
});
test('v70 #15 expired or malformed incoming snapshots are rejected', () => {
  assert.equal(reg.canApplyRegistrationSnapshot(null, { ...base, sessionExpiresAt: now - 1 }, now), false);
  assert.equal(reg.canApplyRegistrationSnapshot(null, { ...base, stage: 'bad' }, now), false);
});
test('v70 #16 completed registration cannot be overwritten by cross-tab messages', () => {
  assert.equal(reg.canApplyRegistrationSnapshot({ ...base, stage: 'completed' }, base, now), false);
});
