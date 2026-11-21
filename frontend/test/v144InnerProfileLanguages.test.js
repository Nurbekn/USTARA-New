import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { v144InnerUi, v144InnerLocale } from '../src/pages/auth/innerLocaleV144.js';
import { siteLocalePath, siteLocaleSwitchUrl, readSiteLocale } from '../src/utils/siteLocale.js';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const read = path => readFileSync(resolve(src, path),'utf8');
const scopes = ['forgot','account','completion','customer','setup'];
const langs=['uz','ru','en'];
const structurallyEqual = (a,b) => {
  assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());
  for(const key of Object.keys(a)) if(typeof a[key]==='object') structurallyEqual(a[key],b[key]);
  else assert.equal(typeof b[key],'string',key);
};

test('v144 locale fallback rejects invalid and inherited keys',()=>{
  for (const bad of ['__proto__', 'constructor', 'prototype', '', null, undefined, Symbol('x')])
    assert.equal(v144InnerUi(bad),v144InnerUi('uz'));
});

test('v144 URL locale accepts one allowlisted lang value',()=>{
  assert.equal(v144InnerLocale('?lang=ru'),v144InnerUi('ru'));
  assert.equal(v144InnerLocale('?lang=en'),v144InnerUi('en'));
  assert.equal(v144InnerLocale('?lang=__proto__'),v144InnerUi('uz'));
  assert.equal(v144InnerLocale('?lang=en&lang=ru'),v144InnerUi('uz'));
});

for(const scope of scopes){
  test(`${scope} UZ/RU/EN dictionaries share all keys`,()=>{
    for (const lang of langs) structurallyEqual(v144InnerUi('uz')[scope],v144InnerUi(lang)[scope]);
  });
  test(`${scope} no missing or blank UI phrases`,()=>{
    for(const lang of langs){
      const d=v144InnerUi(lang)[scope];
      for(const [key,value] of Object.entries(d)) if(typeof value==='string') assert.ok(value.trim(),`${lang}.${scope}.${key}`);
    }
  });
}

test('forgot password localized titles and button labels',()=>{
 assert.equal(v144InnerUi('ru').forgot.titles.password,'Новый пароль');
 assert.equal(v144InnerUi('en').forgot.titles.done,'Password updated');
 assert.match(v144InnerUi('uz').forgot.phoneError,/9 ta raqam/);
});

test('password reset retains 5-digit flow and 3-minute help message',()=>{
 const content=read('pages/auth/ForgotPassword.jsx');
 assert.match(content,/const CODE_LENGTH = 5/);
 assert.match(content,/resetRequest\("verify"/);
 assert.match(content,/resetRequest\("resend"/);
 assert.match(content,/validResetToken\(data\.resetToken\)/);
 assert.match(v144InnerUi('en').forgot.helpIntro,/3 minutes/);
});

test('password reset uses allowlisted routes; no secret in link',()=>{
 const content=read('pages/auth/ForgotPassword.jsx');
 assert.match(content,/siteLocalePath\("\/account-recovery", lang\)/);
 assert.match(content,/siteLocalePath\("\/login", lang\)/);
 assert.doesNotMatch(content,/to=\{[^}]*resetToken/);
 assert.equal(siteLocaleSwitchUrl({pathname:'/forgot-password',search:'?lang=uz&otp=12345&resetToken=secret'},'en'),'/forgot-password?lang=en');
});

test('account recovery preserves server status tokens but uses safe localized labels',()=>{
 const content=read('pages/auth/AccountRecovery.jsx');
 assert.match(content,/Object\.hasOwn\(ui\.states, status\)/);
 assert.match(content,/setStatus\(response\.status\)/);
 assert.match(content,/caseId: parts\[0\], ticketToken: parts\[1\]/);
 for (const lang of langs) assert.deepEqual(Object.keys(v144InnerUi(lang).account.states).sort(), ['closed','open','reviewing','verification_needed']);
});

test('account recovery never places tracking token in locale navigation',()=>{
 const content=read('pages/auth/AccountRecovery.jsx');
 assert.match(content,/siteLocalePath\("\/forgot-password", lang\)/);
 assert.doesNotMatch(content,/siteLocalePath\([^\n]*trackingCode/);
 assert.equal(siteLocaleSwitchUrl({pathname:'/account-recovery',search:'?ticketToken=secret&lang=uz'},'ru'),'/account-recovery?lang=ru');
});

test('completion form still separates signup completion and regular profile update',()=>{
 const content=read('pages/auth/CompleteProfile.jsx');
 assert.match(content,/completeRegistration\(normalizeProfilePart/);
 assert.match(content,/saveCustomerProfileToServer/);
 assert.match(content,/updateProfile\(names\)/);
 assert.match(content,/registration\.completionExpiresAt - now/);
});

test('customer profile edit retains server-side save and location checks',()=>{
 const content=read('pages/user/Profile.jsx');
 assert.match(content,/saveCustomerProfileToServer/);
 assert.match(content,/isValidLocation\(draft\.location\)/);
 assert.match(content,/ui\.locationError/);
 assert.match(content,/const marker = useMemo\(\(\) => userMarker\(ui\.mapHere\)/);
});

test('customer profile language and logout do not forward account secrets in URL',()=>{
 const content=read('pages/user/Profile.jsx');
 assert.match(content,/navigate\(siteLocalePath\("\/login", lang\)/);
 assert.match(content,/siteLocalePath\("\/user\/explore\?type=barbers&distance=5", lang\)/);
 assert.equal(siteLocalePath('/login','en'),'/login?lang=en');
});

test('barber setup translates copy without changing working-hours payload',()=>{
 const content=read('pages/barber/BarberProfileEdit.jsx');
 assert.match(content,/validateSetupDraft\(\{ address, location, hours \}\)/);
 assert.match(content,/saveBarberSetup\(\{ address, location, hours \}/);
 assert.match(content,/ui\.workingDays/);
});

test('UX language selection does not add secrets to reset/profile routes',()=>{
 for (const route of ['/forgot-password','/account-recovery','/complete-profile','/user/profile','/barber/profile/edit']) {
  const target=siteLocaleSwitchUrl({pathname:route,search:'?lang=uz&password=secret&token=secret&otp=12345'},'en');
  assert.equal(target,route+'?lang=en');
 }
});

test('independent translation retains business identifier/status shape',()=>{
 const content=read('pages/auth/innerLocaleV144.js');
 assert.doesNotMatch(content,/localStorage|sessionStorage|fetch\(|request\(|setTimeout\(/);
 assert.equal(readSiteLocale('?lang=ru&token=secret'),'ru');
 assert.notEqual(v144InnerUi('ru').completion.title,v144InnerUi('en').completion.title);
});
