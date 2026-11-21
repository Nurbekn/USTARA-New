import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivacyExport } from '../src/components/privacyExportV183.js';
const data={code:'privacy_export',schemaVersion:1,account:{role:'customer',phone:'+998901234567'},profile:{id:3},bookings:[{id:5,serviceId:4,bookingTime:'2026-12-01',status:'pending'}]};
test('v183: only matching account role and complete scoped export accepted',()=>{
 assert.equal(validatePrivacyExport(data,'customer'),true);
 assert.equal(validatePrivacyExport(data,'barber'),false);
 assert.equal(validatePrivacyExport({...data,bookings:[{...data.bookings[0],customerId:99}]},'customer'),false);
 assert.equal(validatePrivacyExport({...data,bookings:Array(5001).fill(data.bookings[0])},'customer'),false);
 assert.equal(validatePrivacyExport({...data,account:{...data.account,phone:'bad'}},'customer'),false);
 assert.equal(validatePrivacyExport({...data,bookings:[{id:5,serviceId:4,status:'pending'}]},'customer'),false);
});
