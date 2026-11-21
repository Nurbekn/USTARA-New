import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountBarberUi, accountBarberLocale } from '../src/components/accountLocaleV145.js';
import { siteLocalePath, siteLocaleSwitchUrl } from '../src/utils/siteLocale.js';

const src = (path) => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
const codes = ['uz', 'ru', 'en'];
const sections = ['phone','devices','revoke','deactivate','barber','hours','telegram'];
for (const section of sections) {
  test(`v145 ${section}: 3 complete languages with consistent keys`, () => {
    const baseline = Object.keys(accountBarberUi('uz')[section]).sort();
    for (const lang of codes) {
      const item = accountBarberUi(lang)[section];
      assert.deepEqual(Object.keys(item).sort(), baseline);
      for (const [key, value] of Object.entries(item)) {
        if (key === 'days') { assert.equal(value.length,7); assert.ok(value.every(day=>typeof day==='string' && day.length>2)); }
        else assert.ok(typeof value==='string' && value.trim().length>0, `${lang}.${section}.${key}`);
      }
    }
  });
}
test('v145 language selector permits only one exact supported code', () => {
  for (const lang of codes) assert.equal(accountBarberLocale('?lang='+lang),accountBarberUi(lang));
  for (const search of ['?lang=__proto__','?lang=toString','?lang=constructor','?lang=ru&lang=en','?lang=EN','?lang[]=ru']) assert.equal(accountBarberLocale(search),accountBarberUi('uz'));
  for (const input of [null,{},['ru'],false,123,'__proto__','constructor']) assert.equal(accountBarberUi(input),accountBarberUi('uz'));
});
test('v145 translated actions retain distinct confirmation and warning copy', () => {
  assert.match(accountBarberUi('en').revoke.confirm,/every device/i);
  assert.match(accountBarberUi('ru').deactivate.confirm,/аккаунт/);
  assert.match(accountBarberUi('en').telegram.instruction,/5 minutes/);
  assert.notEqual(accountBarberUi('ru').phone.invalidPhone,accountBarberUi('uz').phone.invalidPhone);
});
test('v145 phone change preserves OTP digits and request actions', () => {
  const t=src('components/phoneChange/PhoneChangePanel.jsx');
  for(const x of ["Array(5).fill('')","insertOtp(otp, index, value)","phoneChangeRequest('status'", "call('start', { password })", "call('choose', { sessionToken: session.sessionToken, phone: full })", "call('verify', { sessionToken: session.sessionToken, otp: otp.join('') })", "call('resend', { sessionToken: session.sessionToken })",'serverDeadline(data.otpExpiresAt','serverDeadline(data.resendAvailableAt']) assert.ok(t.includes(x),x);
  for(const x of ['copy.codeLabel','copy.samePhone','copy.attempts','copy.openBot','ui.checking','readSiteLocale(location.search)']) assert.ok(t.includes(x),x);
});
test('v145 phone change keeps credentials out of navigation URL', () => {
  const t=src('components/phoneChange/PhoneChangePanel.jsx');
  assert.match(t,/siteLocalePath\('\/login', lang\)/);
  assert.ok(!t.includes('otp=') && !t.includes('password='));
  for(const lang of codes) {const path=siteLocaleSwitchUrl({pathname:'/user/profile',search:'?otp=12345&token=SECRET&password=TOPSECRET'},lang); assert.ok(!/otp|token|password|SECRET/.test(path));}
});
test('v145 devices preserve protected account endpoints', () => {
  const t=src('components/DeviceSessionsPanel.jsx');
  for(const x of ["'/api/auth/sessions/devices'",'`/api/auth/sessions/devices/${item.id}/revoke`',"{token:auth.token}","if (item.current) { clearSession();",'copy.confirm','copy.toggleOpen','copy.signOut']) assert.ok(t.includes(x),x);
  assert.ok(!t.includes('item.ip') && !t.includes('item.token'));
});
test('v145 all-session revoke preserves authenticated request and explicit confirmation',()=>{
  const t=src('components/RevokeSessionsAction.jsx');
  for(const x of ['window.confirm(copy.confirm)',"'/api/auth/sessions/revoke-all'",'{ token: session.token }','clearSession();','copy.busy','siteLocalePath']) assert.ok(t.includes(x),x);
});
test('v145 account deactivation preserves password and explicit opt-in',()=>{
  const t=src('components/DeactivateAccountAction.jsx');
  for(const x of ['window.confirm(copy.confirm)',"'/api/auth/account/deactivate'",'body: { password }','autoComplete="current-password"','!password.trim()','copy.info']) assert.ok(t.includes(x),x);
});
test('v145 barber form localizes visible profile but preserves submitted data',()=>{
  const t=src('pages/barber/Profile.jsx');
  for(const x of ['copy.first','copy.last','copy.saveOk','copy.salonRequired','copy.changePhone','copy.changeLocation','copy.logoutConfirm','copy.phone','copy.photoSaved']) assert.ok(t.includes(x),x);
  for(const x of ['firstName: form.firstName.trim()', 'salonName: form.salonName', 'avatarPhoto: profile.avatarPhoto','updateProfile({', 'clearSession();']) assert.ok(t.includes(x),x);
});
test('v145 barber subpage links carry only language, not private query',()=>{
  const t=src('pages/barber/Profile.jsx');
  for(const p of ['/barber/earnings','/barber/reviews','/barber/services']) {
    assert.ok(t.includes(`siteLocalePath("${p}", lang)`));
    assert.equal(siteLocalePath(p,'en'),p+'?lang=en');
  }
});
test('v145 working hours translates labels without changing weekday numbers, time slots or validation',()=>{
  const t=src('pages/barber/components/WorkingHours.jsx');
  for(const x of ['const ORDER = [1, 2, 3, 4, 5, 6, 0]','360 + i * 30','item.start >= item.end','ui.days[item.day]','ui.invalid','field === "end" && time <= item.start']) assert.ok(t.includes(x),x);
});
test('v145 telegram linking preserves endpoints, commands and bot URL validation',()=>{
  const t=src('pages/barber/components/TelegramLinkCard.jsx');
  for(const x of ['`/api/barbers/telegram${path}`', 'request("status"','request(kind, controller.signal)','<code style={{ overflowWrap: "anywhere" }}>/start {pending.token}</code>','referrerPolicy="no-referrer"','ui.linked','ui.unlinked','ui.instruction']) assert.ok(t.includes(x),x);
});
test('v145 locale preserves date/weekday IDs and safe unknown fallback',()=>{
  const t=accountBarberUi('en');
  assert.equal(t.hours.days[0],'Sunday'); assert.equal(t.hours.days[1],'Monday');
  assert.equal(accountBarberUi('__proto__').hours.days[0],'Yakshanba');
  assert.equal(siteLocalePath('/login','ru'),'/login?lang=ru');
  assert.equal(siteLocalePath('/login?token=secret','en'),'/login?token=secret&lang=en'); // caller must pass only safe path
  const url=siteLocaleSwitchUrl({pathname:'/login', search:'?token=secret&otp=12345'},'ru');
  assert.equal(url,'/login?lang=ru');
});
