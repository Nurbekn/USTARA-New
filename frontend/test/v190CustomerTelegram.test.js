import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { safeCustomerTelegramLink, sameCustomerSession, validCustomerTelegramStatus } from '../src/components/customerTelegramModelV190.js';

test('v190: only the expected Telegram bot deep link and customer start token may open',()=>{
 const good='https://t.me/ustara_bot?start=cust_'+'a'.repeat(48);
 assert.equal(safeCustomerTelegramLink(good),true);
 for(const bad of [null,'https://evil.com/bot?start=cust_'+'a'.repeat(48),good+'&next=https://evil.com',good.replace('https','http'),good.replace('a'.repeat(48),'b'.repeat(65)),good.replace('cust_','qnotify_')])
  assert.equal(safeCustomerTelegramLink(bad),false);
});
test('v190: another customer, role or JWT cannot consume an earlier status request',()=>{
 const a={token:'signed-token',role:'customer',accountId:11,profileId:21};
 assert.equal(sameCustomerSession(a,{...a}),true);
 for(const bad of [{...a,accountId:12},{...a,profileId:22},{...a,token:'new-token'},{...a,role:'barber'},null])
  assert.equal(sameCustomerSession(a,bad),false);
});
test('v190: opt-in cannot be accepted without a confirmed customer link',()=>{
 assert.equal(validCustomerTelegramStatus({linked:false,notificationsEnabled:true}),false);
 assert.equal(validCustomerTelegramStatus({linked:true,notificationsEnabled:true}),true);
 assert.equal(validCustomerTelegramStatus({linked:false,notificationsEnabled:false}),true);
 assert.equal(validCustomerTelegramStatus({linked:true,notificationsEnabled:'yes'}),false);
});
test('v190: customer UI never sends booking notification or sends credentials to external URL',()=>{
 const ui=fs.readFileSync(new URL('../src/components/CustomerTelegramV190.jsx',import.meta.url),'utf8');
 assert.match(ui,/referrerPolicy="no-referrer"/);
 assert.match(ui,/sameCustomerSession/);
 assert.match(ui,/notificationsEnabled/);
 assert.doesNotMatch(ui,/sendMessage|telegram_otp_contacts|chat_id/);
});
