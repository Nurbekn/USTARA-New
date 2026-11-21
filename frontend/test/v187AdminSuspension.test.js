import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suspensionUrlV187,validSuspensionResultV187,suspensionLocaleV187} from '../src/pages/adminSuspensionV187.js';
test('v187: URL is strictly limited to existing profile roles and safe integer IDs',()=>{
  assert.equal(suspensionUrlV187('customer',12),'/api/admin/users/customer/12/suspension');
  assert.equal(suspensionUrlV187('barber',3),'/api/admin/users/barber/3/suspension');
  assert.equal(suspensionUrlV187('admin',1),null);
  assert.equal(suspensionUrlV187('customer',0),null);
  assert.equal(suspensionUrlV187('customer',1.5),null);
});
test('v187: success is confirmed against exact intended role, id, state and no booking changes',()=>{
  const data={role:'customer',profileId:3,suspended:true,sessionsRevoked:true,bookingsChanged:false};
  assert.equal(validSuspensionResultV187(data,'customer',3,'suspend'),true);
  assert.equal(validSuspensionResultV187(data,'customer',3,'restore'),false);
  assert.equal(validSuspensionResultV187({...data,bookingsChanged:true},'customer',3,'suspend'),false);
  assert.equal(validSuspensionResultV187({...data,profileId:4},'customer',3,'suspend'),false);
});
test('v187: every language warns that bookings remain and old sessions are revoked',()=>{
  for(const lang of ['uz','ru','en']){
    const t=suspensionLocaleV187[lang];
    for(const field of ['suspend','restore','suspended','active','reason','warning','restoreWarning','unavailable'])
      assert.ok(t[field],`${lang}.${field}`);
    assert.match(t.warning(5),/5/);
  }
});
test('v187: Admin UI requires a fresh booking-impact preview before suspend',()=>{
  const source=readFileSync(new URL('../src/pages/AdminPanel.jsx',import.meta.url),'utf8');
  assert.match(source,/action==='suspend'/);
  assert.match(source,/validateAccountImpactV186\(impact,user.role,id\)/);
  assert.match(source,/expectedSuspended:user.is_suspended/);
  assert.match(source,/validSuspensionResultV187/);
});
