import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ADMIN_LANGUAGES, readAdminLocale, adminLocaleParams, getAdminUi } from '../src/pages/adminLanguage.js';
const read=(file)=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

const IDS=['overview','users','barbers','bookings','suspension-cases','reports','profile-reports','recovery','telegram','system','queue-settings','smart-settings','promotions','badges'];
const REPORT_REASONS=['address','hours','services','media','other'];
const REPORT_STATUSES=['pending','resolved','dismissed','all'];

test('v139: exactly three supported Admin locales, Uzbek remains default',()=>{
 assert.deepEqual(ADMIN_LANGUAGES.map(x=>x.id),['uz','ru','en']);
 for(const input of ['', '?tab=users', '?lang=uz']) assert.equal(readAdminLocale(input),'uz');
});
test('v139: allowlisted language can be selected from URL query only',()=>{
 for(const lang of ['uz','ru','en']) assert.equal(readAdminLocale(`?lang=${lang}`),lang);
 assert.equal(readAdminLocale(new URLSearchParams('lang=ru')),'ru');
});
test('v139: duplicated and malformed language params fail closed to Uzbek',()=>{
 for(const input of ['?lang=ru&lang=en','?lang=__proto__','?lang=constructor','?lang=RU','?lang=','?lang=%3Csvg%3E','?lang=ru%0A']) {
  assert.equal(readAdminLocale(input),'uz',input);
 }
});
test('v139: the language URL encoder never carries credentials, tab state, or attacker-controlled params',()=>{
 assert.equal(adminLocaleParams('uz').toString(),'');
 assert.equal(adminLocaleParams('ru').toString(),'lang=ru');
 assert.equal(adminLocaleParams('en').toString(),'lang=en');
 for(const input of ['bad','__proto__','en&token=secret',{},null]){
  assert.equal(adminLocaleParams(input).toString(),'');
 }
});
test('v139: unsupported app locale safely falls back to Uzbek dictionary',()=>{
 assert.equal(getAdminUi('__proto__'),getAdminUi('uz'));
 assert.equal(getAdminUi({}),getAdminUi('uz'));
 assert.equal(getAdminUi(null),getAdminUi('uz'));
});
test('v139: every language has the same immutable business section ids',()=>{
 for(const lang of ADMIN_LANGUAGES.map(x=>x.id)){
  assert.deepEqual(Object.keys(getAdminUi(lang).sections),IDS);
  for(const id of IDS) assert.ok(getAdminUi(lang).sections[id].trim().length>1);
 }
});
test('v139: login and shell strings exist in all languages',()=>{
 for(const lang of ['uz','ru','en']){
  const ui=getAdminUi(lang);
  for(const key of ['language','loginTitle','loginIntro','login','password','signingIn','signIn','retryPrefix','retrySuffix','back','exit','control','refresh','loading','listSearch','empty']){
   assert.equal(typeof ui[key],'string');assert.ok(ui[key].trim().length,`${lang} ${key}`);
  }
 }
});
test('v139: overview counters preserve their original eight semantic keys',()=>{
 const keys=['customers','barbers','pendingBarbers','approvedBarbers','pendingBookings','completedBookings','posts','reports'];
 for(const lang of ['uz','ru','en']) assert.deepEqual(Object.keys(getAdminUi(lang).overview),keys);
});
test('v139: profile report labels preserve status/reason identifiers and never alter API status values',()=>{
 for(const lang of ['uz','ru','en']){
  const p=getAdminUi(lang).profile;
  assert.deepEqual(Object.keys(p.reasons),REPORT_REASONS);
  assert.deepEqual(Object.keys(p.status),REPORT_STATUSES);
  assert.equal(p.headers.length,5);
  for(const key of ['description','filter','previous','next','empty','resolve','dismiss']) assert.ok(p[key].length>1);
 }
});
test('v139: Russian and English admin chrome provide actual localized text',()=>{
 assert.equal(getAdminUi('ru').sections.overview,'Обзор');
 assert.equal(getAdminUi('en').loginTitle,'Administrator sign-in');
 assert.notEqual(getAdminUi('ru').profile.description,getAdminUi('uz').profile.description);
});
test('v139: AdminPanel language switch is URL-only replace and does not write admin credentials to a URL',()=>{
 const jsx=read('../src/pages/AdminPanel.jsx');
 assert.match(jsx,/useSearchParams\(\)/);
 assert.match(jsx,/readAdminLocale\(params\)/);
 assert.match(jsx,/setParams\(adminLocaleParams\(e\.target\.value\),\{replace:true\}\)/);
 assert.match(jsx,/sessionStorage\.getItem\(KEY\)/);
 assert.doesNotMatch(jsx,/setParams\([^\n]*token/);
});
test('v139: admin navigation and overview render localized labels without changing endpoint identifiers',()=>{
 const jsx=read('../src/pages/AdminPanel.jsx');
 assert.match(jsx,/ui\.sections\[id\]/);
 assert.match(jsx,/ui\.sections\[tab\]/);
 assert.match(jsx,/ui\.overview\.customers/);
 assert.match(jsx,/ui\.overview\.reports/);
 assert.match(jsx,/`\/api\/admin\/\$\{endpoint\}`/);
});
test('v139: authenticated profile issue review still only submits original status ids',()=>{
 const jsx=read('../src/pages/AdminPanel.jsx');
 assert.match(jsx,/!\['resolved','dismissed'\]\.includes\(status\)/);
 assert.match(jsx,/confirmedProfileReview\(result,id,status\)/);
 assert.match(jsx,/profileReportsEndpoint\(profileIssueFilter,profileIssuePage\)/);
});
test('v139: ProfileIssuesAdmin translates text only, keeps original paging and review calls',()=>{
 const jsx=read('../src/pages/ProfileIssuesAdmin.jsx');
 assert.match(jsx,/getAdminUi\(lang\)\.profile/);
 assert.match(jsx,/onPageChange\(page-1\)/);
 assert.match(jsx,/onPageChange\(page\+1\)/);
 assert.match(jsx,/onReview\(item\.id,'resolved'\)/);
 assert.match(jsx,/onReview\(item\.id,'dismissed'\)/);
 assert.doesNotMatch(jsx,/item\.reporter_user_id|item\.phone|customer_phone/);
});
test('v139: language switching preserves component state and existing API operation logic',()=>{
 const jsx=read('../src/pages/AdminPanel.jsx');
 assert.match(jsx,/const \[tab,setTab\]=useState\('overview'\)/);
 assert.match(jsx,/const \[token,setToken\]=useState/);
 assert.match(jsx,/const \[profileIssuePage,setProfileIssuePage\]=useState\(1\)/);
 assert.match(jsx,/controller\.signal\.aborted/);
 assert.match(jsx,/sessionStorage\.removeItem\(KEY\)/);
});
