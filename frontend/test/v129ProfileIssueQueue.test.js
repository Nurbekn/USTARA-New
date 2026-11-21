import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROFILE_REPORT_PAGE_SIZE,PROFILE_REPORT_MAX_PAGE,PROFILE_REPORT_STATUSES,
 profileReportsEndpoint,confirmedProfileReview} from '../src/pages/profileIssueQueueModel.js';
const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('v129: admin queue contains four explicit filters',()=>{
 assert.deepEqual(PROFILE_REPORT_STATUSES.map(x=>x[0]),['pending','resolved','dismissed','all']);
});
test('v129: valid status and page generate bounded local API paths',()=>{
 assert.equal(profileReportsEndpoint('pending',1),'profile-reports?status=pending&page=1');
 assert.equal(profileReportsEndpoint('all',100),'profile-reports?status=all&page=100');
 assert.equal(PROFILE_REPORT_PAGE_SIZE,100);
 assert.equal(PROFILE_REPORT_MAX_PAGE,100);
});
test('v129: invalid status and page cannot enter request path',()=>{
 for(const status of ['../bookings','pending&x=1','',null,{},['all']]) assert.equal(profileReportsEndpoint(status,1),null);
 for(const page of [0,-1,101,1.5,'1',null,Infinity,NaN]) assert.equal(profileReportsEndpoint('all',page),null);
});
test('v129: review receipt requires exact record and outcome, not an HTTP 200 alone',()=>{
 assert.equal(confirmedProfileReview({id:7,status:'resolved'},7,'resolved'),true);
 assert.equal(confirmedProfileReview({id:'7',status:'dismissed'},7,'dismissed'),true);
 for(const reply of [undefined,null,{},[],{id:8,status:'resolved'},{id:7,status:'pending'}, {id:7,status:'dismissed'}])
   assert.equal(confirmedProfileReview(reply,7,'resolved'),false);
 assert.equal(confirmedProfileReview({id:7,status:'resolved'},7,'pending'),false);
});
test('v129: report form cancels inflight requests on barberId change and stale finally does not unlock a newer request',()=>{
 const src=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(src,/\}, \[barberId\]\)/);
 assert.match(src,/controllerRef\.current\?\.abort\(\)/);
 assert.match(src,/if \(controllerRef\.current === controller\)/);
 assert.match(src,/setDetails\(''\)/);
});
test('v129: admin load aborts pending requests and rejects stale token/sequence results',()=>{
 const src=read('../src/pages/AdminPanel.jsx');
 assert.match(src,/loadState\.current\.sequence===sequence/);
 assert.match(src,/sessionStorage\.getItem\(KEY\)===token/);
 assert.match(src,/controller\.signal\.aborted/);
 assert.match(src,/signal:controller\.signal/);
 assert.match(src,/clearTimeout\(timer\);discardLoad\(\)/);
});
test('v129: review checks receipt and refreshes after uncertain network outcome instead of auto-repeating mutation',()=>{
 const src=read('../src/pages/AdminPanel.jsx');
 assert.match(src,/if\(!confirmedProfileReview\(result,id,status\)\)/);
 assert.match(src,/await load\(\);/);
 assert.match(src,/reviewInFlight\.current/);
 const copy=read('../src/pages/adminOperationsLocale.js');
 assert.match(src,/ops\.errors\.profileRefresh/);
 assert.match(src,/await load\(\)/);
 assert.match(copy,/Qayta yuborishdan oldin yangi holatni tekshiring/);
});
test('v129: admin paging controls are bounded and state-driven',()=>{
 const src=read('../src/pages/ProfileIssuesAdmin.jsx');
 assert.match(src,/statusFilter/);assert.match(src,/onPageChange\(page\+1\)/);
 assert.match(src,/onPageChange\(page-1\)/);
 assert.match(src,/page>=PROFILE_REPORT_MAX_PAGE/);
 assert.match(src,/hasNext/);
});
test('v129: profile queue never renders reporter identity or phone from admin list',()=>{
 const src=read('../src/pages/ProfileIssuesAdmin.jsx');
 assert.doesNotMatch(src,/item\.reporter_user_id|item\.phone|customer_phone/);
});
