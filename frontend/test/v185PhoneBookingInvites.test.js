import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inviteLinkV185,inviteSelectionV185} from '../src/pages/user/barber/phoneInviteModelV185.js';
const token='A'.repeat(43),origin='https://ustara.example';
const now=Date.parse('2026-11-21T06:00:00Z');
const offer={barberId:9,serviceId:17,bookingTime:'2026-11-24T09:30:00Z',expiresAt:'2026-11-21T06:30:00Z'};
test('v185: link uses exact intended barber and random token, contains no phone or confirmation action',()=>{
 const link=inviteLinkV185(9,token,origin);
 assert.equal(link,`${origin}/barbers/9?tab=services&phone_invite=${token}`);
 assert.equal(inviteLinkV185(0,token,origin),'');
 assert.equal(inviteLinkV185(9,'malformed',origin),'');
 assert.equal(inviteLinkV185(9,token,'javascript:danger'),'');
});
test('v185: server-bound invitation preselects date/service/5min time, never creates booking',()=>{
 assert.deepEqual(inviteSelectionV185(offer,9,[17,22],['2026-11-24'],now),
  {serviceId:17,date:'2026-11-24',time:'14:30'});
 for(const invalid of [{...offer,barberId:10},{...offer,serviceId:32},
  {...offer,expiresAt:'2026-11-20T00:00:00Z'},
  {...offer,bookingTime:'invalid'}, {...offer,bookingTime:'2026-11-24T09:31:00Z'}]) {
  assert.equal(inviteSelectionV185(invalid,9,[17],['2026-11-24'],now),null);
 }
 assert.equal(inviteSelectionV185(offer,9,[17],['2026-11-25'],now),null);
});
test('v185: UI uses standard booking confirmation, never sends guest/phone data to booking endpoint',()=>{
 const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
 const notice=read('../src/pages/user/barber/PhoneBookingInviteNoticeV185.jsx');
 const customer=read('../src/pages/user/barber/InlineBooking.jsx');
 const barber=read('../src/pages/barber/components/PhoneBookingInvitesV185.jsx');
 assert.match(notice,/request\('GET',`\/api\/bookings\/phone-invites\//);
 assert.match(customer,/PhoneBookingInviteNoticeV185/);
 assert.match(customer,/setServiceIds\(\[picked.serviceId\]\)/);
 assert.match(customer,/captureBookingConfirmation/);
 assert.match(barber,/\/api\/bookings\/phone-invites\/mine/);
 assert.match(barber,/\/api\/bookings\/phone-invites/);
 assert.doesNotMatch(barber,/customerPhone|phone_number|INSERT INTO bookings/);
});
