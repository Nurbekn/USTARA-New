import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterBookingInboxV176, INBOX_SEARCH_LIMIT_V176} from '../src/pages/barber/data/bookingInboxV176.js';
import {bookingInboxLocaleV176} from '../src/pages/barber/bookingInboxLocaleV176.js';
const file=(p)=>readFileSync(new URL('../src/pages/barber/'+p,import.meta.url),'utf8');
const rows=[
 {id:1,date:'2026-11-21',customer:'Ali Valiyev',service:'Soch olish',phone:'+998909999999'},
 {id:2,date:'2026-11-22',customer:'Dilnoza',service:'Soqol',phone:'+998901234567'},
 {id:3,date:'2026-11-21',customer:'Kamol',service:'Soch + soqol'},
];
test('#145 v176: search by customer, service and #ID only; case/space folded',()=>{
 assert.deepEqual(filterBookingInboxV176(rows,{query:'  ALI  '}).map(x=>x.id),[1]);
 assert.deepEqual(filterBookingInboxV176(rows,{query:'SOQOL'}).map(x=>x.id),[2,3]);
 assert.deepEqual(filterBookingInboxV176(rows,{query:'#2'}).map(x=>x.id),[2]);
 assert.equal(filterBookingInboxV176(rows,{query:'+998909999999'}).length,0,'phone must not be searchable');
});
test('#145 v176: date filters only the already-loaded list',()=>{
 assert.deepEqual(filterBookingInboxV176(rows,{date:'2026-11-21',query:'soch'}).map(x=>x.id),[1,3]);
 assert.deepEqual(filterBookingInboxV176(rows,{date:'2026-11-22'}).map(x=>x.id),[2]);
 assert.equal(filterBookingInboxV176(rows,{date:'2026-11-23'}).length,0);
});
test('#145 v176: never modifies source, tolerates malformed records and missing data',()=>{
 const frozen=Object.freeze(rows.map(item=>Object.freeze({...item})));
 assert.deepEqual(filterBookingInboxV176(frozen).map(x=>x.id),[1,2,3]);
 assert.deepEqual(filterBookingInboxV176(null),[]);
 assert.deepEqual(filterBookingInboxV176([null,42,rows[0]],{query:'Ali'}).map(x=>x.id),[1]);
 assert.deepEqual(frozen.map(x=>x.id),[1,2,3]);
});
test('#145 v176: forged phone/private notes never become searchable; query is bounded',()=>{
 assert.equal(filterBookingInboxV176([{...rows[0],notes:'secret'}],{query:'secret'}).length,0);
 assert.equal(filterBookingInboxV176(rows,{query:'x'.repeat(1000)}).length,0);
 assert.equal(INBOX_SEARCH_LIMIT_V176,80);
});
test('#145 v176: 3 complete locales and safe unknown-language fallback',()=>{
 for(const lang of ['uz','ru','en']) {
  const t=bookingInboxLocaleV176(lang);
  for(const key of ['title','search','date','reset','count','noMatch','scope','refresh'])
   assert.ok(typeof t[key]==='string'&&t[key].length>2,`${lang}.${key}`);
  assert.match(t.count,/\{count\}/);
 }
 assert.equal(bookingInboxLocaleV176('__proto__'),bookingInboxLocaleV176('uz'));
});
test('#145 v176: filters are attached only to existing barber Bookings; no mutation path added',()=>{
 const page=file('Bookings.jsx'),component=file('components/BookingInboxFiltersV176.jsx');
 assert.match(page,/filterBookingInboxV176\(lists\[active\]/);
 assert.match(page,/<BookingInboxFiltersV176/);
 assert.match(page,/setVisible\(PAGE_SIZE\)/);
 assert.match(page,/status !== "ready"/);
 assert.match(component,/type="search"/);
 assert.match(component,/type="date"/);
 assert.match(component,/aria-live="polite"/);
 assert.doesNotMatch(component,/setBookingStatus|innerHTML|localStorage|sessionStorage|fetch\(/);
 assert.match(page,/BookingCard key=\{b\.id\} booking=\{b\}/);
});
