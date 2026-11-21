import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeRequestUrlV189,noticeRequestOkV189,canRequestTelegramV189,noticeLocaleV189} from '../src/pages/suspensionTelegramNoticesV189.js';
test('v189: URL only accepts bounded numeric case identifiers',()=>{
 assert.equal(noticeRequestUrlV189('7'),'/api/admin/suspension-cases/7/telegram-notice');
 for(const id of ['0','-2','1;drop','a','1/2'])assert.equal(noticeRequestUrlV189(id),null);
});
test('v189: Admin may only request for active reviewed case contacting barber once',()=>{
 const record={contact_role:'barber',telegram_contact_available:true,account_still_suspended:true,case_status:'reviewed',booking_status:'confirmed',telegram_notice_status:null};
 assert.equal(canRequestTelegramV189(record),true);
 for(const change of [{telegram_contact_available:false},{contact_role:'customer'},{case_status:'pending'},{account_still_suspended:false},{booking_status:'cancelled'},{telegram_notice_status:'uncertain'},{telegram_notice_status:'accepted'}]){
  assert.equal(canRequestTelegramV189({...record,...change}),false);
 }
});
test('v189: queued response means not sent; all languages avoid delivery claim',()=>{
 assert.equal(noticeRequestOkV189({caseId:'7',noticeStatus:'queued',notificationsSent:false,bookingsChanged:false},7),true);
 assert.equal(noticeRequestOkV189({caseId:'7',noticeStatus:'accepted',notificationsSent:true,bookingsChanged:false},7),false);
 for(const lang of ['uz','ru','en'])for(const key of ['queued','sending','accepted','uncertain','cancelled','confirm','note'])assert.ok(noticeLocaleV189[lang][key]);
});
