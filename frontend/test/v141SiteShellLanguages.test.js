import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SITE_LANGUAGES, readSiteLocale, getSiteUi, siteLocalePath, siteLocaleSwitchUrl} from '../src/utils/siteLocale.js';
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const languages=['uz','ru','en'];

test('v141 #76 exactly three UI languages, Uzbek default',()=>{
 assert.deepEqual(SITE_LANGUAGES.map(item=>item.id),languages);
 assert.equal(readSiteLocale(''), 'uz');
 assert.equal(readSiteLocale('?lang=ru'),'ru');
 assert.equal(readSiteLocale('?lang=en'),'en');
 assert.equal(readSiteLocale(new URLSearchParams('lang=ru')),'ru');
});
test('v141 language pollution and prototypes fail closed',()=>{
 for(const input of ['?lang=ru&lang=en','?lang=constructor','?lang=__proto__','?lang=toString','?lang=EN','?lang=%3Cscript%3E','?lang=','?lang=ru%0a']) assert.equal(readSiteLocale(input),'uz',input);
 for(const value of ['__proto__','constructor', {}, null, false, 0]) assert.equal(getSiteUi(value), getSiteUi('uz'));
});
test('v141 all UI translations have identical typed navigation keys',()=>{
 const model=getSiteUi('uz');
 for(const lang of languages){
  const ui=getSiteUi(lang);
  for(const group of ['public','footer','customer','barber']){
   assert.deepEqual(Object.keys(ui[group]),Object.keys(model[group]),`${lang}/${group}`);
   for(const [key,value] of Object.entries(ui[group])) assert.ok(typeof value==='string' && value.trim(), `${lang}.${group}.${key}`);
  }
 }
});
test('v141 Russian and English visible words are truly localized',()=>{
 assert.equal(getSiteUi('ru').public.signIn,'Войти');
 assert.equal(getSiteUi('en').customer.bookings,'Bookings');
 assert.equal(getSiteUi('ru').barber.queue,'Очередь');
 assert.notEqual(getSiteUi('ru').footer.description,getSiteUi('uz').footer.description);
});
test('v141 route encoding retains only intended per-link query and hash',()=>{
 assert.equal(siteLocalePath('/user/explore?type=barbers','ru'),'/user/explore?type=barbers&lang=ru');
 assert.equal(siteLocalePath('/help?category=barber','en'),'/help?category=barber&lang=en');
 assert.equal(siteLocalePath('/#about','en'),'/?lang=en#about');
 assert.equal(siteLocalePath('/user?lang=ru','uz'),'/user');
 assert.equal(siteLocalePath('/help?topic=privacy&lang=ru','en'),'/help?topic=privacy&lang=en');
});
test('v141 arbitrary language cannot inject URL parameters',()=>{
 for(const lang of ['en&token=abc','bad', null,{}, '__proto__']){
  const route=siteLocalePath('/user/bookings',lang);
  assert.equal(route,'/user/bookings');
 }
});
test('v141 external URL or backslash paths are rejected',()=>{
 for(const path of ['https://evil.example/?token=secret','//evil.example/p', 'javascript:alert(1)', '\\evil.example', null,{}]) assert.equal(siteLocalePath(path,'en'),'/');
});
test('v141 language switching drops OTP credentials and other sensitive query values',()=>{
 const location={pathname:'/user',search:'?otp=123456&token=abc&lang=ru&password=secret'};
 assert.equal(siteLocaleSwitchUrl(location,'en'),'/user?lang=en');
 assert.equal(siteLocaleSwitchUrl(location,'uz'),'/user');
});
test('v141 language switching retains only allowlisted bounded search filters',()=>{
 const location={pathname:'/user/explore',search:'?type=barbers&q=fade&sort=distance&otp=123&token=secret&lang=ru'};
 assert.equal(siteLocaleSwitchUrl(location,'en'),'/user/explore?type=barbers&q=fade&sort=distance&lang=en');
});
test('v141 repeated, malformed, or too long search filters are never carried forward',()=>{
 const input={pathname:'/explore',search:`?q=one&q=two&sort=${'a'.repeat(101)}&token=xyz`};
 assert.equal(siteLocaleSwitchUrl(input,'ru'),'/explore?lang=ru');
});
test('v141 language switches on help preserve category/topic without forwarding search history',()=>{
 const input={pathname:'/help',search:'?category=barber&topic=barber-profile&q=private%20input&lang=en'};
 assert.equal(siteLocaleSwitchUrl(input,'ru'),'/help?category=barber&topic=barber-profile&lang=ru');
});
test('v141 site language select reads URL and uses replace navigation only',()=>{
 const jsx=source('../src/components/SiteLanguageSelect.jsx');
 assert.match(jsx,/readSiteLocale\(location\.search\)/);
 assert.match(jsx,/siteLocaleSwitchUrl\(location, event\.target\.value\)/);
 assert.match(jsx,/replace: true/);
 assert.doesNotMatch(jsx,/localStorage|sessionStorage|fetch\(|axios/);
});
test('v141 public Navbar and Footer link only to localized internal route paths',()=>{
 const navbar=source('../src/components/Navbar.jsx');
 const footer=source('../src/components/Footer.jsx');
 for(const key of ['/help','/login','/signup']) assert.ok(navbar.includes(`siteLocalePath("${key}", lang)`));
 assert.match(navbar,/SiteLanguageSelect/);
 assert.match(footer,/siteLocalePath\("\/barbers", lang\)/);
 assert.match(footer,/ui\.footer\.rights/);
});
test('v141 customer navigation keeps decision #60 five tab order and IDs unchanged',()=>{
 const jsx=source('../src/layouts/UserLayout.jsx');
 const nav=jsx.match(/const navigation = \[([\s\S]*?)\];/)?.[1];
 assert.ok(nav);
 assert.deepEqual([...nav.matchAll(/\{ to: "([^"]+)", label: "([^"]+)"/g)].map(x=>x[1]),['/user','/user/explore?type=barbers','/user/social','/user/bookings','/user/profile']);
 assert.match(jsx,/to=\{siteLocalePath\(to, lang\)\}/);
 assert.match(jsx,/ui\.navLabel/);
});
test('v141 customer notifications translate static shell without changing authorized booking API',()=>{
 const jsx=source('../src/layouts/UserLayout.jsx');
 for(const field of ['notifications','loading','error','allBookings']) assert.match(jsx,new RegExp(`ui\\.${field}\\b`));
 assert.match(jsx,/smartCopy\.explanation/);
 assert.match(jsx,/smartCopy\.emptyFilter/);
 assert.match(jsx,/loadCustomerBookings\(\{ signal: controller\.signal \}\)/);
 assert.match(jsx,/notificationsController\.current\?\.abort\(\)/);
});
test('v141 barber navigation keeps existing five route IDs and status mutations untouched',()=>{
 const jsx=source('../src/layouts/BarberLayout.jsx');
 for(const path of ['/barber','/barber/bookings','/barber/queue','/barber/services','/barber/profile']) assert.ok(jsx.includes(`to: "${path}"`));
 assert.match(jsx,/to=\{siteLocalePath\(item\.to, lang\)\}/);
 assert.match(jsx,/STATUS\.PENDING/);
 assert.match(jsx,/refreshBarberData\(\)/);
});
test('v141 translated HelpCenter links retain locale and never include authorization tokens',()=>{
 const jsx=source('../src/pages/help/HelpCenter.jsx');
 assert.match(jsx,/siteLocalePath\(item\.path, lang\)/);
 assert.match(jsx,/siteLocalePath\(index === 0/);
 assert.doesNotMatch(jsx,/password=|token=|Authorization/);
});
test('v141 no backend, migrations, account auth or booking mutation code altered by this i18n slice',()=>{
 const jsx=[source('../src/layouts/UserLayout.jsx'),source('../src/layouts/BarberLayout.jsx'),source('../src/components/Navbar.jsx')].join('\n');
 assert.doesNotMatch(jsx,/POST.*lang|Authorization.*lang|body:.*lang|localStorage\.setItem\(['"]lang/);
});
