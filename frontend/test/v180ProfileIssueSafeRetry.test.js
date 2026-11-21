import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canSendProfileIssue,makeProfileIssuePayload,parseMyPendingProfileIssues} from '../src/pages/user/barber/profileIssueModel.js';
import {profileIssueUiV180} from '../src/pages/user/barber/profileIssueLocaleV180.js';
const read=(name)=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const base={payload:makeProfileIssuePayload('address','Manzil ko‘chasi noto‘g‘ri.'),pendingState:'ready',pendingReasons:[],reason:'address',status:'idle',sending:false};
test('v180 #178 allows a report only after server confirms pending state',()=>{
 assert.equal(canSendProfileIssue(base),true);
 for(const state of ['idle','loading','error','unknown']) assert.equal(canSendProfileIssue({...base,pendingState:state}),false);
});
test('v180 #178 rejects duplicates, malformed pending and busy/unknown request outcomes',()=>{
 for(const change of [{pendingReasons:['address']},{pendingReasons:null},{status:'sending'},{status:'sent'},{sending:true},{payload:null}])
  assert.equal(canSendProfileIssue({...base,...change}),false);
 assert.equal(canSendProfileIssue({...base,reason:'other'}),true);
});
test('v180 #178 malformed status payload fails closed',()=>{
 assert.equal(parseMyPendingProfileIssues({pendingReasons:['other','other']}),null);
 assert.equal(parseMyPendingProfileIssues({pendingReasons:['admin']}),null);
});
test('v180 #178 localized strings include all categories, fail-safe retry and no automatic resolution claim',()=>{
 for(const lang of ['uz','ru','en']){
  const ui=profileIssueUiV180(lang);
  assert.deepEqual(Object.keys(ui.reasons),['address','hours','services','media','other']);
  for(const key of ['open','close','hint','retry','unknown','pendingError','sent','submit','loginRequired'])
   assert.equal(typeof ui[key],'string');
  assert.ok(ui.unknown.length>5);
 }
 assert.equal(profileIssueUiV180('invalid'),profileIssueUiV180('uz'));
});
test('v180 #178 no blind resend on status error or ambiguous POST; manual status refresh exists',()=>{
 const source=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(source,/pendingState === 'error' && <button type="button"/);
 assert.match(source,/setPendingRevision\(previous => previous \+ 1\)/);
 assert.match(source,/setPendingState\('idle'\)/);
 assert.match(source,/disabled=\{!canSendProfileIssue\(/);
 assert.match(source,/getSession\(\)\?\.token !== token/);
});
test('v180 #178 public profile passes current locale and does not expose credentials in issue UI',()=>{
 const profile=read('../src/pages/user/barber/BarberPublicProfile.jsx');
 const form=read('../src/pages/user/barber/ProfileIssueReport.jsx');
 assert.match(profile,/<ProfileIssueReport barberId=\{barber\.id\} lang=\{lang\}/);
 assert.doesNotMatch(form, /pending\.phone|pending\.reporter_user_id|pending\.details/);
});
