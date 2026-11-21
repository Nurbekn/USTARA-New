import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseMyPendingProfileIssues} from '../src/pages/user/barber/profileIssueModel.js';
import {isProfileReportPage,visibleProfileReports,hasMoreProfileReports,PROFILE_REPORT_PAGE_SIZE} from '../src/pages/profileIssueQueueModel.js';
const read=(p)=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const makeRows=(n)=>Array.from({length:n},(_,i)=>({id:i+1,barber_id:7,reason:'address',status:'pending',details:'Valid description'}));
test('v130: own pending categories are strictly validated',()=>{
 assert.deepEqual(parseMyPendingProfileIssues({pendingReasons:['hours','address']}),['hours','address']);
 assert.deepEqual(parseMyPendingProfileIssues({pendingReasons:[]}),[]);
});
test('v130: malformed, duplicate and injected pending states fail closed',()=>{
 for(const payload of [null,{},[],{pendingReasons:null},{pendingReasons:['other','other']},
  {pendingReasons:['__proto__']},{pendingReasons:[{}]},{pendingReasons:'address'},
  {pendingReasons:['hours','services','media','address','other','hours']}]) {
  assert.equal(parseMyPendingProfileIssues(payload),null);
 }
});
test('v130: exact 100-row page is final without look-ahead row',()=>{
 const rows=makeRows(100);
 assert.equal(isProfileReportPage(rows),true);assert.equal(hasMoreProfileReports(rows),false);
 assert.equal(visibleProfileReports(rows).length,100);
});
test('v130: 101-row page has next page but renders 100 rows only',()=>{
 const rows=makeRows(101);
 assert.equal(PROFILE_REPORT_PAGE_SIZE,100);
 assert.equal(hasMoreProfileReports(rows),true);
 assert.equal(visibleProfileReports(rows).length,100);
 assert.equal(visibleProfileReports(rows).at(-1).id,100);
});
test('v130: malformed or overflow admin pages cannot be rendered',()=>{
 for(const value of [null,{},[],...[]]){if(Array.isArray(value))continue;assert.equal(isProfileReportPage(value),false);}
 const bad=[makeRows(102),[{id:7,barber_id:1,status:'admin',reason:'address',details:'x'}],
 [{id:2,barber_id:4,status:'pending',reason:'unknown',details:'x'}],
 [{id:2,barber_id:4,status:'pending',reason:'hours',details:{secret:12}}]];
 for(const value of bad){assert.equal(isProfileReportPage(value),false);assert.equal(visibleProfileReports(value).length,0);assert.equal(hasMoreProfileReports(value),false);}
});
test('v130: admin guards malformed API rows before publishing',()=>{
 const src=read('../src/pages/AdminPanel.jsx');
 assert.match(src,/!isProfileReportPage\(result\)/);
 assert.match(src,/visibleProfileReports\(sourceRows\)/);
 assert.match(src,/hasMoreProfileReports\(data\)/);
});
test('v130: private GET uses token and abort signal and refuses stale profile result',()=>{
 const src=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(src,/request\('GET', `\/api\/barbers\/\$\{barberId\}\/profile-report\/status`/);
 assert.match(src,/token, signal: controller\.signal/);
 assert.match(src,/controller\.signal\.aborted \|\| latestBarberId\.current !== barberId/);
 assert.match(src,/getSession\(\)\?\.token !== token/);
});
test('v130: duplicate category disabled until admin handles it',()=>{
 const src=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(src,/pendingReasons\.includes\(reason\)/);
 assert.match(src,/ui\.pendingDuplicate/);
 assert.match(read('../src/pages/user/barber/profileIssueLocaleV180.js'),/Bu turdagi xabaringiz allaqachon tekshirilmoqda/);
 assert.match(src,/setPendingReasons\(previous =>/);
});
test('v130: both pending and submission requests are cancelled on navigation/close',()=>{
 const src=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(src,/pendingControllerRef\.current\?\.abort\(\)/);
 assert.match(src,/controllerRef\.current\?\.abort\(\)/);
 assert.match(src,/\}, \[barberId, opened, session\?\.token, session\?\.role, pendingRevision\]\)/);
});
test('v130: no reporter phone or profile ID from private status is rendered',()=>{
 const src=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.doesNotMatch(src,/pending\.reporter_user_id|pending\.phone|pending\.details/);
});
