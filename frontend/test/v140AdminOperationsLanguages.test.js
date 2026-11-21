import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ADMIN_LANGUAGES} from '../src/pages/adminLanguage.js';
import {getAdminOperations,adminStatusLabel,adminRoleLabel,adminTableHeaders} from '../src/pages/adminOperationsLocale.js';
const jsx=fs.readFileSync(new URL('../src/pages/AdminPanel.jsx',import.meta.url),'utf8');
const sections={users:5,barbers:5,bookings:6,recovery:5,reports:6,promotions:4};
const languages=ADMIN_LANGUAGES.map(item=>item.id);

test('v140 supported languages mirror Admin language whitelist',()=>assert.deepEqual(languages,['uz','ru','en']));
test('v140 unknown / prototype language uses Uzbek without object-property bypass',()=>{
 for(const bad of ['__proto__','constructor','toString','RU',null,{},'en&token=secret']) assert.equal(getAdminOperations(bad),getAdminOperations('uz'));
});
test('v140 all operational tables share exactly the same immutable column counts',()=>{
 for(const lang of languages) for(const [section,count] of Object.entries(sections)) {
  const headers=adminTableHeaders(section,lang); assert.equal(headers.length,count,`${lang}/${section}`);
  headers.forEach(h=>assert.ok(typeof h==='string'&&h.trim().length>1));
 }
});
test('v140 unknown table never reveals inherited keys',()=>{
 assert.deepEqual(adminTableHeaders('__proto__','en'),[]);
 assert.deepEqual(adminTableHeaders('constructor','ru'),[]);
});
test('v140 table headers are returned as independent arrays',()=>{
 const headers=adminTableHeaders('users','en');headers[0]='mutated';
 assert.equal(adminTableHeaders('users','en')[0],'User');
});
test('v140 Russian and English headings are genuinely localized',()=>{
 assert.equal(adminTableHeaders('bookings','ru')[0],'Запись');
 assert.equal(adminTableHeaders('reports','en')[0],'Post');
 assert.notDeepEqual(adminTableHeaders('users','en'),adminTableHeaders('users','uz'));
});
test('v140 status label is presentation only, known values localized',()=>{
 assert.equal(adminStatusLabel('pending','ru'),'Ожидает');
 assert.equal(adminStatusLabel('completed','en'),'Completed');
 assert.equal(adminStatusLabel('verification_needed','ru'),'Требуется проверка');
 assert.equal(adminStatusLabel('approved','uz'),'Tasdiqlangan');
});
test('v140 unknown status safe fallback and no inherited JS keys',()=>{
 for(const x of ['__proto__','constructor','toString','new_external_status']) assert.equal(adminStatusLabel(x,'en'),x);
 assert.equal(adminStatusLabel(null,'en'),'—');
});
test('v140 roles are localized and unknown roles remain recognizable',()=>{
 assert.equal(adminRoleLabel('barber','en'),'Barber');
 assert.equal(adminRoleLabel('customer','ru'),'Клиент');
 assert.equal(adminRoleLabel('superadmin','en'),'superadmin');
});
test('v140 every locale includes actionable confirmation texts',()=>{
 for(const lang of languages){const ops=getAdminOperations(lang);
  for(const name of ['verifyQuestion','deleteAccountQuestion','promoteQuestion','reviewRecoveryQuestion','removePostQuestion','profileReviewQuestion']) assert.equal(typeof ops[name],'function');
  assert.match(ops.verifyQuestion(5,'approved'),/5/);
  assert.match(ops.deleteAccountQuestion('Test','+998 90 100'),/998 90 100/);
  assert.match(ops.removePostQuestion(12),/12/);
 }
});
test('v140 confirms approved and rejected actions distinctly in every language',()=>{
 for(const lang of languages){const o=getAdminOperations(lang); assert.notEqual(o.verifyQuestion(1,'approved'),o.verifyQuestion(1,'rejected'));}
});
test('v140 all five admin operational action groups are translated',()=>{
 for(const lang of languages){const o=getAdminOperations(lang);
  for(const key of ['delete','approve','reject','review','needsVerification','close','deletePost','stop','promote','save']) assert.ok(o.actions[key].trim());
 }
});
test('v140 promotion and QR labels exist with equivalent semantics',()=>{
 for(const lang of languages){const o=getAdminOperations(lang);
  for(const key of ['description','hours','active']) assert.ok(o.promotion[key].trim());
  for(const key of ['title','description','duration','current','minute']) assert.ok(o.qr[key].trim());
 }
});
test('v140 telegram diagnostic messages and statuses are localized',()=>{
 for(const lang of languages){const o=getAdminOperations(lang);
  for(const key of ['title','mode','configured','api','identity','webhook','linked','yes','no','reachable','match','mismatch','present','unknown','conflict','hint']) assert.ok(o.telegram[key].trim(),`${lang}.${key}`);
 }
});
test('v140 AdminPanel renders tables via localized labels (not translated API keys)',()=>{
 assert.match(jsx,/adminTableHeaders\(tab,lang\)/);
 assert.match(jsx,/adminTableHeaders\('promotions',lang\)/);
 assert.match(jsx,/adminRoleLabel\(r\.role,lang\)/);
 assert.match(jsx,/adminStatusLabel\(r\.status,lang\)/);
});
test('v140 operational confirmations use localized messages',()=>{
 for(const key of ['verifyQuestion','deleteAccountQuestion','promoteQuestion','reviewRecoveryQuestion','removePostQuestion','profileReviewQuestion']) assert.match(jsx,new RegExp(`ops\\.${key}\\(`));
});
test('v140 admin QR and Telegram diagnostics display translated copy without changing numeric QR TTL',()=>{
 assert.match(jsx,/ops\.qr\.duration/);
 assert.match(jsx,/ops\.telegram\.conflict/);
 assert.match(jsx,/ttl_minutes:minutes/);
 assert.match(jsx,/minutes<1\|\|minutes>120/);
});
test('v140 retains unchanged API ids and mutation methods',()=>{
 for(const pattern of [/request\('PATCH',`\/api\/barbers\/\$\{id\}\/verify`/,/request\('DELETE',`\/api\/admin\/users\//,/request\('POST',`\/api\/admin\/account-recovery\//,/request\('PUT','\/api\/admin\/queue\/qr-settings'/,/request\('DELETE',`\/api\/admin\/posts\//]) assert.match(jsx,pattern);
});
test('v140 locale remains only in useSearchParams and never in request bodies',()=>{
 assert.match(jsx,/readAdminLocale\(params\)/);
 assert.match(jsx,/setParams\(adminLocaleParams\(e\.target\.value\),\{replace:true\}\)/);
 assert.doesNotMatch(jsx,/body:\{[^}]*lang/);
});
test('v140 translations do not print passwords, tokens or recovery personal documents',()=>{
 const ops=JSON.stringify(Object.fromEntries(languages.map(lang=>[lang,{...getAdminOperations(lang),deleteAccountQuestion:undefined}])));
 assert.doesNotMatch(ops,/sessionStorage|localStorage|Authorization|Bearer /);
 assert.match(jsx,/sessionStorage\.removeItem\(KEY\)/);
});
