import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getSmartBookingAdminLocale,isValidSmartBookingAdminState} from '../src/pages/smartBookingAdminLocaleV159.js';
const code=file=>readFileSync(new URL('../src/pages/'+file,import.meta.url),'utf8');
test('v159: Smart Booking admin translations include all three languages',()=>{
 for(const lang of ['uz','ru','en']){
  const s=getSmartBookingAdminLocale(lang);
  for(const field of ['title','description','active','paused','pause','resume','confirmPause','confirmResume','unknown'])
   assert.ok(typeof s[field]==='string'&&s[field].length>=3,`${lang}.${field}`);
 }
 assert.notEqual(getSmartBookingAdminLocale('ru').pause,getSmartBookingAdminLocale('uz').pause);
});
test('v159: browser validates strict enabled flag and safe revision from pg bigint string',()=>{
 for(const v of [1,'1',200,'200'])assert.equal(isValidSmartBookingAdminState({enabled:false,revision:v}),true);
 for(const rev of [null,undefined,0,'0',1.5,'1.5','1e3',-1,'-1','999999999999999999999','abc'])
  assert.equal(isValidSmartBookingAdminState({enabled:true,revision:rev}),false);
 assert.equal(isValidSmartBookingAdminState({enabled:'false',revision:1}),false);
 assert.equal(isValidSmartBookingAdminState(null),false);
});
test('v159: admin UI contains GET/PUT protected admin routes and explicit revision CAS',()=>{
 const page=code('AdminPanel.jsx');
 assert.match(page,/tab==='smart-settings'\?'smart-booking\/rules'/);
 assert.match(page,/request\('PUT','\/api\/admin\/smart-booking\/rules'/);
 assert.match(page,/expected_revision:Number\(data\.revision\)/);
 assert.match(page,/getSmartBookingAdminLocale\(lang\)/);
 assert.match(page,/window\.confirm\(nextEnabled\?smartUi\.confirmResume:smartUi\.confirmPause\)/);
 assert.match(page,/await load\(\)/);
 assert.match(page,/sessionStorage\.getItem\(KEY\)===previousToken/);
 assert.match(page,/activeView\.current\.tab==='smart-settings'/);
});
test('v159: names of admin settings section are localized',()=>{
 const s=code('adminLanguage.js');
 assert.match(s,/'smart-settings':'Smart Booking'/);
 const page=code('AdminPanel.jsx');
 assert.match(page,/\['smart-settings','Smart Booking'\]/);
 assert.match(page,/isValidSmartBookingAdminState\(updated\)/);
});
