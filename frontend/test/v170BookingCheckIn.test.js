import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCheckIn,canRequestCheckIn,checkInUi} from '../src/pages/user/bookings/checkInV170.js';
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const start='2026-11-21T11:00:00Z';
test('#102 customer requests only in correct booking window',()=>{
 const b={status:'confirmed',startsAt:start,checkIn:null};const at=Date.parse(start);
 assert.equal(canRequestCheckIn(b,at-90*60000),true);
 assert.equal(canRequestCheckIn(b,at+30*60000),true);
 assert.equal(canRequestCheckIn(b,at-90*60000-1),false);
 assert.equal(canRequestCheckIn(b,at+30*60000+1),false);
 assert.equal(canRequestCheckIn({...b,status:'cancelled'},at),false);
 assert.equal(canRequestCheckIn({...b,checkIn:{requestedAt:start,confirmedAt:null}},at),false);
});
test('#102 malformed server check-in data is not trusted',()=>{
 assert.equal(parseCheckIn(null),null);
 assert.deepEqual(parseCheckIn({requestedAt:start,confirmedAt:null}),{requestedAt:'2026-11-21T11:00:00.000Z',confirmedAt:null});
 for(const invalid of [{requestedAt:'not a date',confirmedAt:null}, {requestedAt:start,confirmedAt:42},
   {requestedAt:start,confirmedAt:'2026-11-20T11:00:00Z'}, {requestedAt:null},[],{}])
   assert.throws(()=>parseCheckIn(invalid));
});
test('#102 both parties see different stages, and only barber can confirm',()=>{
 const customer=read('../src/pages/user/bookings/CheckInV170.jsx');
 const barber=read('../src/pages/barber/components/BookingCard.jsx');
 const model=read('../src/pages/user/bookings/model.js');
 const store=read('../src/pages/barber/data/store.js');
 assert.match(customer,/mutateCheckIn\(booking.id,'customer'\)/);
 assert.match(customer,/booking.checkIn.confirmedAt/);
 assert.match(barber,/mutateCheckIn\(booking.id,"barber"\)/);
 assert.match(barber,/booking.status === STATUS.CONFIRMED/);
 assert.match(model,/checkIn: parseCheckIn\(row.check_in\)/);
 assert.match(store,/checkIn: parseCheckIn\(row.check_in\)/);
});
test('#102 locale copy never implies a customer request is accepted',()=>{
 for(const lang of ['uz','ru','en']) {
   const t=checkInUi(lang);
   assert.ok(t.title&&t.pending&&t.confirmed&&t.report&&t.hint);
   assert.notEqual(t.pending,t.confirmed);
 }
});
