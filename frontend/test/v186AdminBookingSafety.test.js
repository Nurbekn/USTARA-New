import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {accountImpactUrlV186,validateAccountImpactV186,accountImpactTextV186} from '../src/pages/adminAccountImpactV186.js';
test('v186: client permits only safe account impact URL targets',()=>{
  assert.equal(accountImpactUrlV186('customer',8),'/api/admin/users/customer/8/booking-impact');
  for(const [role,id] of [['barber',0],['admin',8],['barber',NaN],['barber',2147483648],['customer',1.5]]){
    assert.equal(accountImpactUrlV186(role,id),null);
  }
});
test('v186: no deletion if preview has missing/contradictory values',()=>{
  const good={role:'barber',profileId:8,readOnly:true,activeCount:2,hasUnfinishedBookings:true,
    earliestBookingTime:'2030-01-01T10:00:00Z'};
  assert.equal(validateAccountImpactV186(good,'barber',8),true);
  for(const bad of [{...good,readOnly:false},{...good,activeCount:-1},
    {...good,activeCount:0},{...good,profileId:9},{...good,activeCount:'2'},
    {...good,earliestBookingTime:'nonsense'}])assert.equal(validateAccountImpactV186(bad,'barber',8),false);
  assert.equal(validateAccountImpactV186({...good,activeCount:0,hasUnfinishedBookings:false,earliestBookingTime:null},'barber',8),true);
});
test('v186: Admin requires read-only preview before opening destructive confirmation',()=>{
  const page=fs.readFileSync(new URL('../src/pages/AdminPanel.jsx',import.meta.url),'utf8');
  const start=page.indexOf('const deleteAccount=async');
  const end=page.indexOf('const promote=async',start);
  const fn=page.slice(start,end);
  assert.ok(fn.indexOf("request('GET',impactUrl")>=0);
  assert.ok(fn.indexOf('validateAccountImpactV186')<fn.indexOf('window.prompt'));
  assert.ok(fn.indexOf('if(impact.activeCount>0)')<fn.indexOf("request('DELETE'"));
  assert.ok(fn.includes('sameAccount()'));
  for(const lang of ['uz','ru','en']){
    assert.ok(accountImpactTextV186[lang].unavailable.length>8);
    assert.ok(accountImpactTextV186[lang].blocked(2).includes('2'));
  }
});
