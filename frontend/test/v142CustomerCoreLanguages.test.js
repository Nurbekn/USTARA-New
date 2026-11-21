import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { customerCoreLocale, customerCoreUi } from '../src/pages/user/coreLocale.js';
import { readSiteLocale, siteLocalePath, siteLocaleSwitchUrl } from '../src/utils/siteLocale.js';

const load = (name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const langs = ['uz', 'ru', 'en'];

for (const lang of langs) {
  test(`v142 #76 has complete nonempty ${lang} home/explore/booking strings`, () => {
    const ref = customerCoreUi('uz');
    const other = customerCoreUi(lang);
    for (const section of ['home', 'explore', 'booking']) {
      assert.deepEqual(Object.keys(other[section]).sort(), Object.keys(ref[section]).sort());
      assert.ok(Object.keys(other[section]).length >= (section === 'home' ? 30 : 50));
      for (const [name, value] of Object.entries(other[section])) {
        assert.equal(typeof value, 'string', `${lang}/${section}.${name}`);
        assert.ok(value.trim().length, `${lang}/${section}.${name}`);
        assert.ok(!/[\u0000-\u001f]/.test(value), `${lang}/${section}.${name}`);
      }
    }
  });
}
test('v142 Uzbek is default and unknown locale values fail closed', () => {
  for (const value of ['?lang=__proto__', '?lang=constructor', '?lang=EN', '?lang=ru&lang=en', '?token=abc', '?lang=']) {
    assert.equal(customerCoreLocale(value), 'uz');
    assert.equal(readSiteLocale(value), 'uz');
  }
  for (const value of ['constructor', '__proto__', null, {}, false, 1]) assert.equal(customerCoreUi(value), customerCoreUi('uz'));
});
test('v142 translations cover customer search, service selection, and confirmation', () => {
  assert.equal(customerCoreUi('en').explore.sort, 'Sort by');
  assert.equal(customerCoreUi('ru').home.following, 'Подписки на барберов');
  assert.equal(customerCoreUi('en').booking.confirm, 'Confirm booking');
  assert.equal(customerCoreUi('ru').booking.weekTitle, 'Свободное время на 7 дней');
  for (const key of ['searchPlaceholder','cardBook','cardCompare','badFilters']) {
    assert.notEqual(customerCoreUi('en').explore[key], customerCoreUi('uz').explore[key]);
  }
});
test('v142 site links preserve public language only', () => {
  assert.equal(siteLocalePath('/user/explore?type=barbers', 'en'), '/user/explore?type=barbers&lang=en');
  assert.equal(siteLocalePath('/user/barbers/17?tab=services&services=3%2C8', 'ru'), '/user/barbers/17?tab=services&services=3%2C8&lang=ru');
});
test('v142 language switch retains verified search/service filters', () => {
  const location = {pathname:'/user/explore', search:'?type=barbers&q=fade&area=Yunusobod&min=30000&max=90000&distance=5&service=7&map=1&lang=ru&otp=123&token=abc'};
  const next = siteLocaleSwitchUrl(location, 'en');
  const url = new URL(next, 'https://example.com');
  assert.equal(url.pathname, '/user/explore');
  for (const [key,value] of Object.entries({type:'barbers',q:'fade',area:'Yunusobod',min:'30000',max:'90000',distance:'5',service:'7',map:'1',lang:'en'})) assert.equal(url.searchParams.get(key),value,key);
  for (const key of ['otp','token','password','session','auth']) assert.ok(!url.searchParams.has(key),key);
});
test('v142 language switch retains verified booking choice only on a profile path', () => {
  const loc = {pathname:'/user/barbers/14', search:'?tab=services&services=9,12&token=secret&otp=321&lang=ru'};
  assert.equal(siteLocaleSwitchUrl(loc,'en'), '/user/barbers/14?tab=services&services=9%2C12&lang=en');
  assert.equal(siteLocaleSwitchUrl(loc,'uz'), '/user/barbers/14?tab=services&services=9%2C12');
  assert.equal(siteLocaleSwitchUrl({...loc,pathname:'/barbers/14'},'en'), '/barbers/14?tab=services&services=9%2C12&lang=en');
});
test('v142 invalid, duplicate and oversized booking choices are rejected', () => {
  for (const services of ['1,1','0','-1','1,x','01','999999999999999999999','1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21','']) {
    const next = siteLocaleSwitchUrl({pathname:'/user/barbers/14',search:'?tab=services&services='+encodeURIComponent(services)+'&token=abc'}, 'ru');
    assert.equal(next, '/user/barbers/14?tab=services&lang=ru', services);
  }
  for(const tab of ['__proto__','edit','admin','services&token=1']) assert.equal(siteLocaleSwitchUrl({pathname:'/user/barbers/14',search:'?tab='+encodeURIComponent(tab)},'en'),'/user/barbers/14?lang=en');
  assert.equal(siteLocaleSwitchUrl({pathname:'/user/barbers/14',search:'?tab=posts&tab=services'},'en'),'/user/barbers/14?lang=en');
});
test('v142 language switch does not carry booking options into unrelated pages', () => {
  for(const pathname of ['/user', '/login','/user/bookings','/help','/barbers','/user/barbers/new','/user/barbers/0','//evil']) {
    const result=siteLocaleSwitchUrl({pathname,search:'?services=3%2C4&tab=services&otp=9999&token=secret'},'en');
    assert.ok(!result.includes('services='),pathname);
    assert.ok(!result.includes('tab='),pathname);
    assert.ok(!result.includes('token'),pathname);
    assert.ok(!result.includes('otp='),pathname);
  }
});
test('v142 duplicate invalid and unsafe search filters are not copied on language change', () => {
  const next=siteLocaleSwitchUrl({pathname:'/user/explore',search:'?service=7&service=8&min=abc&max=-5&map=3&area=A&otp=123456'},'ru');
  assert.equal(next,'/user/explore?area=A&lang=ru');
});
test('v142 only the intended customer screens are wired to locale helper', () => {
  const paths=['UserHome.jsx','Explore.jsx','explore/ResultCard.jsx','explore/ComparisonPanel.jsx','barber/InlineBooking.jsx'];
  for(const path of paths) {
    const content=load('../src/pages/user/'+path);
    assert.ok(content.includes('customerCoreUi'),path);
  }
  const home=load('../src/pages/user/UserHome.jsx');
  assert.ok(home.includes('siteLocalePath(`/user/explore?${params}`, lang)'));
  const explore=load('../src/pages/user/Explore.jsx');
  assert.ok(explore.includes('lang={lang}'));
  const booking=load('../src/pages/user/barber/InlineBooking.jsx');
  assert.ok(booking.includes('const ui = customerCoreUi(lang).booking'));
  assert.ok(booking.includes('captureBookingConfirmation(confirmationInput)'));
  assert.ok(booking.includes('isBookingConfirmationCurrent'));
  assert.ok(booking.includes('watchAvailabilityWeek'));
});
test('v142 only UI copy changed; booking core is still isolated', () => {
  const booking=load('../src/pages/user/barber/InlineBooking.jsx');
  for(const value of ['expectedTotalPrice: confirmation.price','expectedDurationMinutes: confirmation.duration','token: session.token','serviceIds: [...confirmation.serviceIds]','requestId:attempt.requestId']) assert.ok(booking.includes(value),value);
  const compare=load('../src/pages/user/explore/ComparisonPanel.jsx');
  assert.ok(compare.includes('siteLocalePath(row.bookingUrl, lang)'));
  assert.ok(compare.includes('siteLocalePath(row.profileUrl, lang)'));
});
