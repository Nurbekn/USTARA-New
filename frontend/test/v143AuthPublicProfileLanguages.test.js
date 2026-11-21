import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { authLocale, authUi, localizedOtpError } from '../src/pages/auth/authLocale.js';
import { publicProfileUi } from '../src/pages/user/barber/publicProfileLocale.js';
import { siteLocalePath, siteLocaleSwitchUrl } from '../src/utils/siteLocale.js';
import { publicProfileTab, publicProfileTabLink } from '../src/pages/user/barber/profileNavigation.js';
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const languages = ['uz', 'ru', 'en'];
const authBase = authUi('uz');
const profileBase = publicProfileUi('uz');

for (const lang of languages) {
  test(`v143 ${lang}: auth has identical complete translation keys`, () => {
    const other = authUi(lang);
    assert.deepEqual(Object.keys(other).sort(), Object.keys(authBase).sort());
    assert.ok(Object.keys(other).length >= 65);
    for (const [k, v] of Object.entries(other)) assert.ok(typeof v === 'string' && v.trim() && !/[\u0000-\u001f]/.test(v), k);
  });
  test(`v143 ${lang}: public profile has complete translation keys`, () => {
    const ui = publicProfileUi(lang);
    assert.deepEqual(Object.keys(ui).sort(), Object.keys(profileBase).sort());
    assert.deepEqual(ui.days.length, 7);
    for (const [k, v] of Object.entries(ui)) {
      if (k === 'days') for (const day of v) assert.ok(typeof day === 'string' && day.trim());
      else assert.ok(typeof v === 'string' && v.trim(), k);
    }
  });
}
test('v143 locale rejects duplicate, forged or prototype names', () => {
  for (const input of ['?lang=__proto__', '?lang=constructor', '?lang=ru&lang=en', '?lang=EN', '?lang=toString', '?lang=']) assert.equal(authLocale(input), 'uz');
  for (const input of ['__proto__', 'constructor', null, false, {}, ['ru']]) {
    assert.equal(authUi(input), authBase);
    assert.equal(publicProfileUi(input), profileBase);
  }
});
test('v143 Russian and English auth and profile really differ from Uzbek', () => {
  assert.equal(authUi('en').otpTitle, 'Verification code');
  assert.equal(authUi('ru').loginTitle, 'Вход');
  assert.equal(publicProfileUi('en').book, 'Book now');
  assert.equal(publicProfileUi('ru').services, 'Услуги');
  assert.notEqual(authUi('en').invalidPhone, authUi('uz').invalidPhone);
});
test('v143 OTP errors localize known codes without leaking user input', () => {
  const otpValues = ['invalid_otp', 'otp_expired', 'otp_not_sent', 'registration_blocked', 'invalid_session', 'network_error'];
  for (const code of otpValues) {
    for (const lang of languages) {
      const message = localizedOtpError({ code, message: 'SECRET_PII_123' }, lang);
      assert.ok(message.trim());
      assert.ok(!message.includes('SECRET_PII_123'));
    }
  }
  assert.equal(localizedOtpError({ status:429 }, 'ru'), authUi('ru').otpRate);
  assert.equal(localizedOtpError({ code:'unknown', message:'token=secret' }, 'en'), authUi('en').otpFailed);
});
test('v143 auth language switching never forwards OTP, password or session token', () => {
  for (const path of ['/login','/signup','/signup/sartarosh','/otp','/forgot-password','/complete-profile']) {
    const url = siteLocaleSwitchUrl({ pathname:path, search:'?password=hidden&otp=12345&sessionToken=ABC&token=BBB&lang=uz' },'ru');
    assert.equal(url,`${path}?lang=ru`);
  }
});
test('v143 language survives safe login, registration and OTP navigation', () => {
  for (const lang of languages) {
    assert.equal(siteLocalePath('/signup',lang), lang === 'uz' ? '/signup' : `/signup?lang=${lang}`);
    assert.equal(siteLocalePath('/otp',lang), lang === 'uz' ? '/otp' : `/otp?lang=${lang}`);
    assert.equal(siteLocalePath('/complete-profile',lang), lang === 'uz' ? '/complete-profile' : `/complete-profile?lang=${lang}`);
  }
});
test('v143 auth shell exposes language selection without storing credentials', () => {
  const src=read('../src/pages/auth/components/AuthParts.jsx');
  assert.match(src, /SiteLanguageSelect/);
  assert.match(src, /authLocale\(location\.search\)/);
  assert.match(src, /siteLocalePath\("\/signup", lang\)/);
  assert.doesNotMatch(src, /sessionStorage|localStorage|Authorization/);
});
test('v143 shared auth inputs localize accessible labels without modifying input value', () => {
  for (const name of ['AuthParts.jsx','PasswordField.jsx','CaptchaField.jsx']) {
    const src=read('../src/pages/auth/components/'+name);
    assert.match(src,/authUi\(/);
  }
  const password=read('../src/pages/auth/components/PasswordField.jsx');
  assert.match(password,/ui\.showPassword/);
  assert.match(password,/ui\.hidePassword/);
  assert.match(password,/autoComplete=\{signup \|\| confirmation \? "new-password" : "current-password"\}/);
  assert.match(password,/type=\{visible \? "text" : "password"\}/);
  const captcha=read('../src/pages/auth/components/CaptchaField.jsx');
  assert.match(captcha,/maxLength=\{5\}/);
  assert.match(captcha,/check|value=\{value\}/);
});
test('v143 login copy localized, session and booking recovery logic preserved', () => {
  const login=read('../src/pages/auth/Login.jsx');
  for (const marker of ['ui.loginTitle','ui.invalidPhone','ui.missingPassword','ui.reactivate','ui.savedBooking']) assert.ok(login.includes(marker),marker);
  for (const marker of ['login(full, password, reactivate)','setSession(session)','refreshBarberData()','clearRegistration()','bookingDraftResumePath()','dashboardPath(session)']) assert.ok(login.includes(marker),marker);
});
test('v143 OTP remains five digits with exactly original deadline logic', () => {
  const otp=read('../src/pages/auth/Otp.jsx');
  for (const marker of ['const LENGTH = 5','registrationDeadline(pending) <= now','pending.otpExpiresAt <= now','resendRegistration()','verifyRegistration(digits.join(""))','disabled={busy || expired || blocked || otpExpired || !code.every(Boolean)}','countdown(seconds)','SiteLanguageSelect']) assert.ok(otp.includes(marker),marker);
  assert.ok(!otp.includes('localStorage.setItem'));
  assert.ok(!otp.includes('otp=') && !otp.includes('password='));
});
test('v143 registration retains same payload and verification path with safe locale', () => {
  const source=read('../src/pages/auth/components/RegistrationForm.jsx');
  assert.match(source, /startRegistration\(\{ phone: "\+998" \+ digits, password, role/);
  assert.match(source, /navigate\(siteLocalePath\("\/otp", lang\), \{ replace: true \}\)/);
  for (const key of ['ui.signupTitle','ui.barberSignupTitle','ui.specialty','ui.getCode','ui.pendingOtp']) assert.ok(source.includes(key),key);
});
test('v143 public profile preserves service tab, selected service, and locale', () => {
  assert.equal(publicProfileTab('?tab=services&lang=en'),'services');
  assert.equal(publicProfileTab('?tab=not-real&lang=en'),'services');
  const next=publicProfileTabLink('?tab=posts&lang=ru&services=9%2C10','hours');
  assert.equal(next.hash,'#bpv-content');
  assert.equal(new URLSearchParams(next.search).get('lang'),'ru');
  assert.equal(new URLSearchParams(next.search).get('services'),'9,10');
});
test('v143 public profile wires tabs/links and keeps protected fetching', () => {
  const src=read('../src/pages/user/barber/BarberPublicProfile.jsx');
  for (const key of ['publicProfileUi(lang)','ui[item.id]','ui[tab]','ui.bookingHint','ui.noService','siteLocalePath("/help?topic=booking", lang)','publicProfileTabLink(location.search, "services")']) assert.ok(src.includes(key),key);
  for (const key of ['loadBarberProfile(id, { token: customerRoute','getSession()?.role === "customer"','controller.abort()','InlineBooking barber={barber}','ProfileIssueReport barberId={barber.id}']) assert.ok(src.includes(key),key);
});
test('v143 public profile sanitizes back link and drops token/OTP query state', () => {
  const from='/user/explore?type=barbers&q=Fade&token=secret&otp=1234';
  const parsed=new URL(from,'https://ustara.invalid');
  const out=siteLocaleSwitchUrl({pathname:parsed.pathname,search:parsed.search},'en');
  assert.equal(out,'/user/explore?type=barbers&q=Fade&lang=en');
  const src=read('../src/pages/user/barber/BarberPublicProfile.jsx');
  assert.match(src,/siteLocaleSwitchUrl\(/);
});
