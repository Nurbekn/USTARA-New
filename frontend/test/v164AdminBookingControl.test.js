import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bookingControlEndpointV164,validBookingControlResponseV164,bookingLocaleV164,STATUSES_V164} from '../src/pages/adminBookingControlV164.js';
const source=file=>fs.readFileSync(new URL(`../src/pages/${file}`,import.meta.url),'utf8');
test('v164: booking endpoint URL encodes allowlisted immutable query filters',()=>{
 assert.equal(bookingControlEndpointV164(),'/api/admin/bookings/control?status=all&page=1');
 assert.equal(bookingControlEndpointV164({status:'confirmed',date:'2026-11-21',barberId:'42',page:2}),'/api/admin/bookings/control?status=confirmed&page=2&date=2026-11-21&barberId=42');
 for(const params of [{status:'evil'},{barberId:'1%20OR%201=1'},{barberId:'0'},{barberId:'9999999999'},{date:'2026-02-30'},{date:'2026-11-21T00:00:00Z'},{page:101},{page:0},{page:'1'}])assert.equal(bookingControlEndpointV164(params),null);
 assert.deepEqual(STATUSES_V164,['all','pending','confirmed','completed','cancelled','rejected']);
});
test('v164: admin booking responses are validated before rendering',()=>{
 const base={page:1,pageSize:50,hasNext:false,bookings:[{id:3,status:'confirmed'}]};
 assert.equal(validBookingControlResponseV164(base,1),true);
 for(const b of [{...base,page:2},{...base,pageSize:200},{...base,hasNext:'false'},{...base,bookings:new Array(51).fill(base.bookings[0])},{...base,bookings:[{id:'evil',status:'confirmed'}]}])assert.equal(validBookingControlResponseV164(b,1),false);
});
test('v164: admin bookings are read only and have accessible filters and status translations',()=>{
 const jsx=source('AdminBookingControlV164.jsx');const parent=source('AdminPanel.jsx');
 assert.match(jsx,/type="date"/);assert.match(jsx,/aria-label=\{labels\.page\}/);
 assert.match(jsx,/validBookingControlResponseV164/);
 assert.match(jsx,/onUnauthorized\?\.\(\)/);
 assert.match(jsx,/return \(\)=>\{active=false;controller\.abort\(\);\}/);
 assert.ok(!/request\(['"](?:POST|PUT|PATCH|DELETE)['"]/.test(jsx));
 assert.match(parent,/<AdminBookingControlV164 token=\{token\}/);
 assert.match(parent,/if\(!token\|\|\['bookings','suspension-cases'\]\.includes\(tab\)\)return/);
 for(const lang of ['uz','ru','en'])assert.ok(bookingLocaleV164[lang].intro&&bookingLocaleV164[lang].apply);
});
