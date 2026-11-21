import {test} from 'node:test';
import assert from 'node:assert/strict';
import {barberPhone, bookingLocation, bookingSalon, bookingMapLinks} from '../src/pages/user/bookings/navigation.js';

test('v125: full, coordinate-backed salon and verified barber phone', () => {
 const row={barber_salon_name:' Ustara ',barber_address:' Toshkent, Amir Temur ',barber_latitude:41.31,barber_longitude:69.28,barber_phone:'+998901234567'};
 assert.deepEqual(bookingSalon(row), {name:'Ustara',address:'Toshkent, Amir Temur',location:{lat:41.31,lng:69.28}});
 assert.equal(barberPhone(row),'+998901234567');
});
test('v125: absent address/contact produce no invented salon or navigation', () => {
 assert.equal(bookingSalon({}),null);
 assert.equal(barberPhone({}),null);
 assert.deepEqual(bookingMapLinks(null),[]);
});
test('v125: zero-valued coordinates are finite but unavailable halves are rejected', () => {
 assert.deepEqual(bookingLocation({barber_latitude:0,barber_longitude:0}),{lat:0,lng:0});
 for(const bad of [null,undefined,'41.3',NaN,Infinity,-Infinity,91,-91]) {
  assert.equal(bookingLocation({barber_latitude:bad,barber_longitude:69.28}),null);
 }
 for(const bad of [null,undefined,'69.3',NaN,Infinity,-Infinity,181,-181]) {
  assert.equal(bookingLocation({barber_latitude:41.3,barber_longitude:bad}),null);
 }
});
test('v125: XSS and unverified phone links never appear', () => {
 for(const phone of ['javascript:alert(1)', 'tel:+998901234567', '+99890123#123', '+998-90-123-45-67', ' 1234567', '0000000', '+123', {}, 123456789, '+1234567890123456'])
  assert.equal(barberPhone({barber_phone:phone}),null);
});
test('v125: map providers use trusted HTTPS hosts and correct lat/lng order', () => {
 const links=bookingMapLinks({lat:41.31,lng:69.28});
 assert.deepEqual(links.map(x=>x.name),['Google Maps','Yandex Maps','2GIS','OpenStreetMap']);
 for(const {href} of links) assert.equal(new URL(href).protocol, 'https:');
 assert.equal(new URL(links[0].href).searchParams.get('query'),'41.31,69.28');
 assert.equal(new URL(links[1].href).searchParams.get('pt'),'69.28,41.31');
 assert.match(links[2].href,/69\.28,41\.31$/);
 assert.equal(new URL(links[3].href).searchParams.get('mlat'),'41.31');
 assert.equal(new URL(links[3].href).searchParams.get('mlon'),'69.28');
});
test('v125: invalid map location returns no links, never strings from input', () => {
 for (const p of [{lat:92,lng:0},{lat:1,lng:200},{lat:'41.3',lng:69.28},{lat:NaN,lng:20},{lat:41.3,lng:'javascript:evil'},{}])
  assert.deepEqual(bookingMapLinks(p),[]);
});
test('v125: contact fields are trimmed and bounded, not treated as links', () => {
 const row={barber_salon_name:'A'.repeat(250),barber_address:'B'.repeat(800)};
 assert.equal(bookingSalon(row).name.length,200);
 assert.equal(bookingSalon(row).address.length,500);
});
