import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
const urlFor = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function load(url) {
  let text = (await readFile(url, 'utf8')).replaceAll('import.meta.env', '{"DEV":true}');
  for (const [, relative] of text.matchAll(/from "([^"]+)"/g)) {
    text = text.replace(`from "${relative}"`, `from "${await load(new URL(relative,url))}"`);
  }
  return urlFor(text);
}
const registration = await import(await load(new URL('../src/pages/auth/utils/registration.js', import.meta.url)));
const now = Date.now();
const base = { role:'customer', phone:'+998901234567', sessionToken:'a'.repeat(64),
  stage:'otp', sessionExpiresAt:now+600000, resendAt:now+60000,
  otpExpiresAt:now+60000, deliveryPending:false };
test('v69: consistent customer and barber snapshots are accepted', () => {
  assert.equal(registration.validRegistrationSnapshot(base,now),true);
  assert.equal(registration.validRegistrationSnapshot({...base,role:'barber',specialty:'stylist'},now),true);
});
test('v69: a barber snapshot without an approved specialty is rejected', () => {
  assert.equal(registration.validRegistrationSnapshot({...base,role:'barber',specialty:'invalid'},now),false);
});
test('v69: pending bot delivery is never accepted for verified stage', () => {
  const delivered={...base, deliveryPending:true, otpExpiresAt:null, botUrl:'https://t.me/ustara_test_bot'};
  assert.equal(registration.validRegistrationSnapshot(delivered,now),true);
  assert.equal(registration.validRegistrationSnapshot({...delivered,stage:'verified',completionExpiresAt:now+100000},now),false);
});
test('v69: expired and malformed snapshots are rejected', () => {
  assert.equal(registration.validRegistrationSnapshot({...base,sessionExpiresAt:now-1},now),false);
  assert.equal(registration.validRegistrationSnapshot({...base,sessionToken:'bad'},now),false);
  assert.equal(registration.validRegistrationSnapshot({...base,phone:'+99800'},now),false);
});
test('v69: names accept Unicode whitespace but reject unexpected input safely', () => {
  assert.equal(registration.registrationNameError('  Ali\tValiyev  '),'');
  assert.equal(registration.registrationNameError(undefined),'Ism yoki familiyani to‘g‘ri kiriting.');
  assert.notEqual(registration.registrationNameError('!'), '');
});
test('v69: opaque registration errors do not crash the UI', () => {
  assert.equal(registration.registrationError(null),'So‘rov bajarilmadi. Qayta urinib ko‘ring.');
  assert.equal(registration.otpError(undefined),'So‘rov bajarilmadi. Qayta urinib ko‘ring');
  assert.equal(registration.registrationError({message:42}),'So‘rov bajarilmadi. Qayta urinib ko‘ring.');
});
