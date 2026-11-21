import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTodaySmartBookingOffers,todayOfferClock,todayOfferDisplayStatus} from '../src/pages/barber/data/todaySmartBookingOffersV158.js';
import {barberInsightsText,hasBarberInsightsTranslation} from '../src/pages/barber/barberInsightsLocaleV147.js';
const item=(id,more={})=>({id,state:'offered',start_at:'2026-11-20T09:30:00.000Z',
 duration_minutes:30,booking_id:null,display_label:'Mehmon',
 expires_at:'2026-11-20T09:24:00.000Z',telegram_notice_status:'sent',...more});
const parse=entries=>parseTodaySmartBookingOffers({openings:entries});

test('v158: only valid, limited barber offers are rendered in chronological order',()=>{
 const list=parse([item('12',{start_at:'2026-11-20T10:30:00Z'}),item(8)]);
 assert.deepEqual(list.map(x=>x.id),[8,12]);
 assert.equal(list[0].display_label,'Mehmon');
 assert.deepEqual(parse([]),[]);
});
test('v158: accepted QR/Telegram invitation never masquerades as a confirmed booking',()=>{
 assert.equal(todayOfferDisplayStatus(item(1,{state:'accepted',offer_status:'accepted'})),'accepted');
 assert.equal(todayOfferDisplayStatus(item(2,{state:'closed',booking_id:77})),'confirmed');
 assert.equal(todayOfferDisplayStatus(item(3,{state:'accepted',booking_id:'91'})),'confirmed');
 assert.equal(todayOfferDisplayStatus(null),null);
});
test('v158: reject duplicated, oversized, missing, unsafe, malformed or inconsistent offer read data',()=>{
 const invalid=[null,{openings:null},{openings:Array.from({length:51},(_,i)=>item(i+1))},
 {openings:[item(1),item('1')]}, {openings:[item(1,{id:'9223372036854775807'})]},
 {openings:[item(1,{state:'forbidden'})]}, {openings:[item(1,{duration_minutes:0})]},
 {openings:[item(1,{start_at:'yesterday'})]}, {openings:[item(1,{expires_at:'never'})]},
 {openings:[item(1,{booking_id:'bad'})]}, {openings:[item(1,{display_label:'\nprivate'})]},
 {openings:[item(1,{offer_status:'unknown'})]}, {openings:[item(1,{telegram_notice_status:'hacked'})]}];
 for (const response of invalid) assert.equal(parseTodaySmartBookingOffers(response),null,JSON.stringify(response)?.slice(0,100));
});
test('v158: clock renders in Asia/Tashkent regardless of browser timezone',()=>{
 assert.equal(todayOfferClock('2026-11-20T09:30:00Z','en'),'14:30');
 assert.equal(todayOfferClock('bad'),'—');
});
test('v158: read-only offers UI clears stale account response and validates server payload',()=>{
 const jsx=readFileSync(new URL('../src/pages/barber/components/TodaySmartBookingOffersV158.jsx',import.meta.url),'utf8');
 const page=readFileSync(new URL('../src/pages/barber/Bookings.jsx',import.meta.url),'utf8');
 assert.match(jsx,/getSession\(\)\?\.token===session\.token/);
 assert.match(jsx,/inFlight\.current\?\.abort\(\)/);
 assert.match(jsx,/generation\.current===seq/);
 assert.match(jsx,/parseTodaySmartBookingOffers\(payload\)/);
 assert.match(jsx,/request\('GET','\/api\/queue\/offers\/mine'/);
 assert.doesNotMatch(jsx, /request\('(POST|PATCH|DELETE)'/);
 assert.match(page,/<TodaySmartBookingOffersV158 lang=\{lang\} \/>/);
});
test('v158: offer labels and booking-vs-offer disclaimer are translated in 3 languages',()=>{
 for(const key of ['Takliflar yuklanmoqda…','Takliflarni yuklab bo‘lmadi.',
 'Qabul qilingan taklif hali bron emas. Bron faqat mijoz tasdiqlagach paydo bo‘ladi.']){
  for(const lang of ['en','ru']){
   assert.equal(hasBarberInsightsTranslation(lang,key),true,key);
   assert.notEqual(barberInsightsText(lang)(key),key);
  }
 }
});
