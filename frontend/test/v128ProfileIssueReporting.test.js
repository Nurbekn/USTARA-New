import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeProfileIssuePayload,PROFILE_ISSUE_REASONS,validReportBarberId} from '../src/pages/user/barber/profileIssueModel.js';
const read=(name)=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
test('v128: five fixed reasons match client and server contracts',()=>{
 assert.deepEqual(PROFILE_ISSUE_REASONS.map(([key])=>key),['address','hours','services','media','other']);
});
test('v128: valid profile issue normalizes whitespace without changing content',()=>{
 assert.deepEqual(makeProfileIssuePayload('address','  Ko‘cha noto‘g‘ri ko‘rsatilgan  '),{reason:'address',details:'Ko‘cha noto‘g‘ri ko‘rsatilgan'});
});
test('v128: invalid reasons, blank and too long details fail closed',()=>{
 for(const reason of ['spam','admin','__proto__',{},undefined])assert.equal(makeProfileIssuePayload(reason,'Enough text to submit'),null);
 for(const value of ['less', '   ', 'A'.repeat(501), 'Valid text\u0000hidden',1,{},null])assert.equal(makeProfileIssuePayload('other',value),null);
});
test('v128: boundary is 10–500 meaningful characters',()=>{
 assert.equal(makeProfileIssuePayload('other','A'.repeat(10))?.details.length,10);
 assert.equal(makeProfileIssuePayload('other','A'.repeat(500))?.details.length,500);
 assert.equal(makeProfileIssuePayload('other','A'.repeat(9)),null);
});
test('v128: reject invalid route IDs and never allow query/path injection',()=>{
 for(const bad of [null,0,'0','-1','1e2','1.0','7/../',{},Number.MAX_SAFE_INTEGER+1])assert.equal(validReportBarberId(bad),false);
 assert.equal(validReportBarberId('7'),true);
});
test('v128: profile report sends authenticated JSON; no silent success on bad reply',()=>{
 const form=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(form,/getSession\(\)\?\.token/);
 assert.match(form,/request\('POST', `\/api\/barbers\/\$\{barberId\}\/profile-report`/);
 assert.match(form,/response\?\.accepted !== true/);
 assert.match(form,/controllerRef\.current\?\.abort\(\)/);
});
test('v128: login gate, accessible validation, no password requests in UI',()=>{
 const form=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(form,/to="\/login"/);assert.match(form,/aria-expanded=\{opened\}/);
 assert.match(form,/maxLength=\{500\}/);assert.match(form,/disabled=\{!canSendProfileIssue\(/);
 assert.match(form,/ui\.hint/); assert.match(read('../src/pages/user/barber/profileIssueLocaleV180.js'),/shaxsiy hujjat/);
});
test('v128: public profile exposes issue button',()=>{
 assert.match(read('../src/pages/user/barber/BarberPublicProfile.jsx'),/<ProfileIssueReport barberId=\{barber\.id\} lang=\{lang\}/);
});
test('v128: admin reports use separate secure endpoint and review flow',()=>{
 const admin=read('../src/pages/AdminPanel.jsx');
 assert.match(admin,/\['profile-reports','Profil xatolari'\]/);
 assert.match(admin,/request\('PATCH',`\/api\/admin\/profile-reports\/\$\{id\}`/);
 assert.match(admin,/ProfileIssuesAdmin records=\{records\}/);
});
test('v128: admin row renders no reporter phone and no destructive profile action',()=>{
 const admin=read('../src/pages/ProfileIssuesAdmin.jsx');
 assert.doesNotMatch(admin,/reporter_user_id|customer_phone|post_id|onClick=\{\(\)=>remove/);
 assert.match(admin,/item\.status==='pending'/);
 assert.match(admin,/onReview\(item\.id,'resolved'\)/);
 assert.match(admin,/onReview\(item\.id,'dismissed'\)/);
});
