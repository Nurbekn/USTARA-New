import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {customerActivityText,hasCustomerActivityTranslation} from '../src/pages/user/customerActivityLocaleV148.js';
import {siteLocalePath,siteLocaleSwitchUrl,readSiteLocale} from '../src/utils/siteLocale.js';
import {alternativeBookingUrl} from '../src/pages/user/bookings/cancellationAlternatives.js';
import {mapBookingHref,mapProfileHref} from '../src/pages/user/explore/mapLinks.js';
const paths = {
 bookings:'../src/pages/user/Bookings.jsx',
 card:'../src/pages/user/bookings/BookingCard.jsx',
 alternatives:'../src/pages/user/bookings/CancellationAlternatives.jsx',
 map:'../src/pages/user/BarbersMap.jsx',
 social:'../src/pages/user/Social.jsx',
};
const source = (path) => readFileSync(new URL(paths[path],import.meta.url),'utf8');
const t = (lang,key) => customerActivityText(lang)(key);

for (const lang of ['uz','ru','en']) {
 test(`v148/${lang} supports booking steps and server-confirmed cancellation copy`,()=> {
  for (const key of ['Bronlarim','Bronni bekor qilasizmi?','Bronni tahrirlash','Yangi jami narx (server hisoblagan):','Vaqtlar hozircha bo‘sh, lekin band qilib qo‘yilmagan. Yangi bron qilishda vaqt va narx qayta tekshiriladi.']) {
   assert.ok(t(lang,key));
   if(lang!=='uz')assert.notEqual(t(lang,key),key,`${lang}/${key}`);
   else assert.equal(t(lang,key),key);
  }
 });
 test(`v148/${lang} supports social and map discovery strings`,()=> {
  for(const key of ['Ilhom','Postlarni qidirish','Shikoyat yuborish','Sartaroshlar xaritada','Xarita qatlamini yuklab bo‘lmadi. Tarmoqni tekshiring.']) {
   assert.ok(t(lang,key));
   if(lang!=='uz')assert.notEqual(t(lang,key),key,`${lang}/${key}`);
  }
 });
}
test('v148 unknown languages, prototypes and non-strings cannot obtain inherited data',()=>{
 for(const lang of ['__proto__','constructor','En','uk',null,undefined,{},123]) {
  assert.equal(t(lang,'Bronlarim'),'Bronlarim');
 }
 for(const key of ['__proto__','constructor','toString','hasOwnProperty']) {
  assert.equal(t('en',key),key);
  assert.equal(hasCustomerActivityTranslation('en',key),false);
 }
 assert.equal(t('en',null),'');
});
test('v148 all language values are actual translations and never contain control characters',()=>{
 for(const key of ['Bronlarni yuklab bo‘lmadi','Oldingi bron narxi:','Muqobil bo‘sh vaqtlar','Sartaroshlar xaritada','Izohlar yuklanmoqda…']) {
  for(const lang of ['ru','en']) {
   assert.equal(hasCustomerActivityTranslation(lang,key),true);
   assert.ok(t(lang,key).trim().length > 3);
   assert.doesNotMatch(t(lang,key),/[\u0000-\u001f]/);
  }
 }
});
test('v148 booking list keeps actual API cancellation and rescheduling calls unchanged',()=>{
 const s=source('bookings');
 for(const part of ['cancelBooking(cancelling.id','validateCancellation(response, cancelling.id)','loadRescheduleSlots(booking, date','rescheduleCustomerBooking(booking, date, time','quote:changed ? available.total_price : null','controller.signal.aborted','savingRef.current']) {
  assert.ok(s.includes(part),part);
 }
 assert.match(s,/readSiteLocale\(params\)/);
 assert.match(s,/setNotice\(tr\('Bron bekor qilindi/);
});
test('v148 no cancellation occurs from alternative time suggestions',()=>{
 const s=source('alternatives');
 assert.match(s,/loadCancellationAlternatives/);
 assert.match(s,/getSession\(\)/);
 assert.match(s,/subscribeSession\(/);
 assert.match(s,/to=\{siteLocalePath\(alternativeBookingUrl\(booking\), lang\)\}/);
 assert.doesNotMatch(s,/confirmBooking\(|createBooking\(|reserveSlot\(/);
});
test('v148 card preserves monetary amounts, status codes and cancellation eligibility',()=>{
 const s=source('card');
 for(const part of ["total(booking, 'totalPrice', 'price')","Object.hasOwn(STATUSES, booking.status)",'canCancel(booking)','onCancel(booking)','booking.startsAt'])assert.ok(s.includes(part),part);
 assert.match(s,/tr\(statusInfo\(status\)\.label\)/);
});
test('v148 map preserves underlying coordinates, pin filtering and user-reported location',()=>{
 const s=source('map');
 for(const part of ['mappedBarbers(barbers)','good(userLocation)','L.latLngBounds','tileerror: () => setTilesError(true)','state={returnState}','mapBookingHref(b, selectedServiceId, profilePrefix)'])assert.ok(s.includes(part),part);
 assert.match(s,/to=\{siteLocalePath\(mapProfileHref\(b, profilePrefix\), lang\)\}/);
 assert.match(s,/to=\{siteLocalePath\(mapBookingHref\(b, selectedServiceId, profilePrefix\), lang\)\}/);
 assert.match(s,/from: siteLocaleSwitchUrl\(location, lang\)/);
});
test('v148 language for map links keeps validated booking choice, not secrets',()=>{
 const b={id:12, services:[{id:9}],location:{lat:41.3,lng:69.2}};
 // Existing mapLinks owns service validation; localized paths must not bypass it.
 assert.equal(siteLocalePath('/user/barbers/12?tab=services&services=9','ru'),'/user/barbers/12?tab=services&services=9&lang=ru');
 const url=siteLocaleSwitchUrl({pathname:'/user/barbers/12',search:'?tab=services&services=9&otp=abc&token=secret'},'en');
 assert.equal(url,'/user/barbers/12?tab=services&services=9&lang=en');
});
test('v148 social reports preserve server confirmation and moderation reason codes',()=>{
 const s=source('social');
 for(const part of ['reportPost(','response?.accepted !== true','maxLength={500}',"value=\"inappropriate\"","value=\"misleading\"",'sendComment(','setSocialFollow(','setSocialLike(','setSocialSave('])assert.ok(s.includes(part),part);
 assert.match(s,/tr\(label\)/);
});
test('v148 customer bookings retain safe filter and numeric detail on language switch',()=>{
 const result=siteLocaleSwitchUrl({pathname:'/user/bookings',search:'?status=completed&booking=412&lang=uz&otp=12345&token=VERY_PRIVATE&password=x'},'en');
 assert.equal(result,'/user/bookings?status=completed&booking=412&lang=en');
 assert.equal(siteLocaleSwitchUrl({pathname:'/user/bookings',search:'?status=upcoming'},'ru'),'/user/bookings?status=upcoming&lang=ru');
 for(const key of ['booking','status']) {
  const dup=siteLocaleSwitchUrl({pathname:'/user/bookings',search:`?${key}=2&${key}=3&token=abc`},'en');
  assert.equal(dup,'/user/bookings?lang=en');
 }
});
test('v148 rejects invalid booking identifiers and statuses on language switch',()=>{
 for(const id of ['-1','0','NaN','__proto__','not-an-id','12345678901','3000000000','1%2F%2F','+1','01','1.0']){
  const url=siteLocaleSwitchUrl({pathname:'/user/bookings',search:'?booking='+encodeURIComponent(id)},'ru');
  assert.equal(url,'/user/bookings?lang=ru',id);
 }
 for(const status of ['admin','__proto__','unknown','paid','confirmed%00']) {
  assert.equal(siteLocaleSwitchUrl({pathname:'/user/bookings',search:'?status='+encodeURIComponent(status)},'en'),'/user/bookings?lang=en');
 }
});
test('v148 social language switch retains allowed filters without sensitive context',()=>{
 const result=siteLocaleSwitchUrl({pathname:'/user/social',search:'?tab=saved&q=fade&category=cut&post=19&otp=12345&token=secret&session=h'},'ru');
 assert.equal(result,'/user/social?tab=saved&q=fade&category=cut&post=19&lang=ru');
 for(const tab of ['__proto__','admin','foo', 'feed&token=x'])assert.equal(siteLocaleSwitchUrl({pathname:'/user/social',search:'?tab='+encodeURIComponent(tab)},'en'),'/user/social?lang=en');
});
test('v148 invalid repeated or oversized social filters not forwarded',()=>{
 const url=siteLocaleSwitchUrl({pathname:'/user/social',search:'?tab=feed&tab=saved&q='+('x'.repeat(120))+'&post=0&author=barber%3A12&password=secret'},'en');
 assert.equal(url,'/user/social?lang=en');
});
test('v148 unrelated routes cannot steal booking/social selections or sensitive params',()=>{
 for(const path of ['/login','/user','/barber/queue','/help','/user/profile','//evil']) {
  const url=siteLocaleSwitchUrl({pathname:path,search:'?status=confirmed&booking=17&tab=saved&post=3&token=secret&otp=12345'},'ru');
  assert.ok(!url.includes('booking='),path);
  assert.ok(!url.includes('status='),path);
  assert.ok(!url.includes('tab='),path);
  assert.ok(!url.includes('post='),path);
  assert.ok(!url.includes('token='),path);
  assert.ok(!url.includes('otp='),path);
 }
});
test('v148 link builders remain separately responsible for service validity',()=>{
 const booking={barber:{id:12},services:[{id:9}],status:'cancelled',startsAt:'2026-11-21T14:00:00+05:00'};
 assert.equal(alternativeBookingUrl(booking),'/user/barbers/12?services=9');
 assert.equal(siteLocalePath(alternativeBookingUrl(booking),'en'),'/user/barbers/12?services=9&lang=en');
 assert.equal(siteLocalePath(alternativeBookingUrl({...booking,services:[{id:0}]}),'ru'),'/user/explore?lang=ru');
});
test('v148 original JWT/OTP do not get added by new displayed translations',()=>{
 for(const path of Object.keys(paths)) {
  const s=source(path);
  assert.ok(s.includes('customerActivityText'),path);
  assert.doesNotMatch(s,/\?lang=\$\{.*token|token.*\?lang=/,path);
 }
});
