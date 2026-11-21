import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suspensionCasesUrlV188,suspensionCaseActionUrlV188,validCasePageV188,validCaseMutationV188,suspensionCasesLocaleV188} from '../src/pages/adminSuspensionCasesV188.js';
test('v188: cases endpoint strictly enforces allowed filter/page/id',()=>{
 assert.equal(suspensionCasesUrlV188('open',1),'/api/admin/suspension-cases?status=open&page=1');
 for(const status of ['x','pending,closed',''])assert.equal(suspensionCasesUrlV188(status,1),null);
 for(const page of [0,101,'2',1.1])assert.equal(suspensionCasesUrlV188('open',page),null);
 assert.equal(suspensionCaseActionUrlV188('7'),'/api/admin/suspension-cases/7');
 for(const id of ['0','1;DROP',-1,1.5])assert.equal(suspensionCaseActionUrlV188(id),null);
});
test('v188: typed result validates no delivery claims and optimistic revisions',()=>{
 const entry={id:'7',case_status:'pending',revision:0};
 const page={rows:[entry],status:'open',page:1,hasMore:false,readOnlyListing:true,notificationsSent:false};
 assert.equal(validCasePageV188(page,'open',1),true);
 assert.equal(validCasePageV188({...page,notificationsSent:true},'open',1),false);
 assert.equal(validCasePageV188({...page,rows:[{...entry,revision:'0'}]},'open',1),false);
 const result={id:'7',status:'reviewed',revision:1,notificationsSent:false,bookingsChanged:false};
 assert.equal(validCaseMutationV188(result,'7','review',0),true);
 assert.equal(validCaseMutationV188({...result,bookingsChanged:true},'7','review',0),false);
 assert.equal(validCaseMutationV188({...result,revision:2},'7','review',0),false);
});
test('v188: all three locales warn operator that attempt is not delivery',()=>{
 for(const lang of ['uz','ru','en']){
  const l=suspensionCasesLocaleV188[lang];
  for(const k of ['intro','review','attempt','close','confirm','unknown','note','phone','telegram'])assert.ok(l[k],lang+'.'+k);
 }
});
test('v188: Admin UI presents cases separately; no automatic messaging or retry on unknown PATCH',()=>{
 const panel=readFileSync(new URL('../src/pages/AdminPanel.jsx',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/pages/AdminSuspensionCasesV188.jsx',import.meta.url),'utf8');
 assert.match(panel,/tab==='suspension-cases'/);
 assert.match(ui,/action==='attempt'\?\{channel\}:\{\}/);
 assert.match(ui,/setReload\(n=>n\+1\)/);
 assert.doesNotMatch(ui,/sendTelegram|sendSms|sendMessage/);
});
