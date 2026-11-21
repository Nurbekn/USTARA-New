import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBookingTimeline,shiftTimelineDay,validTimelineDay} from '../src/pages/barber/data/bookingTimelineV160.js';
import {bookingTimelineText} from '../src/pages/barber/bookingTimelineLocaleV160.js';
const file=(name)=>readFileSync(new URL(`../src/pages/barber/${name}`,import.meta.url),'utf8');
const day='2026-11-21';
const row=(id,time='09:30',status='confirmed',more={})=>({id,date:day,time,status,duration:30,customer:'Mijoz',service:'Xizmat',...more});

test('v160: chronological all-status timeline; none of the originals is mutated',()=>{
 const rows=[row(10,'11:00','completed'),row(2,'09:15','cancelled'),row(5,'09:15','pending'),row(8,'14:00','rejected'),row(9,'12:00','confirmed'),row(1,'08:00','confirmed',{date:'2026-11-22'})];
 const before=JSON.stringify(rows),result=buildBookingTimeline(rows,day);
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(result.items.map(x=>x.id),[2,5,10,9,8]);
 assert.deepEqual(result.items.map(x=>x.status),['cancelled','pending','completed','confirmed','rejected']);
 assert.equal(result.invalidCount,0);
});
test('v160: crossing midnight shows next-day signal and never wraps negative minutes',()=>{
 const {items}=buildBookingTimeline([row(1,'23:55','confirmed',{duration:70}),row(2,'00:00')],day);
 assert.equal(items[0].endsAt,'00:30');assert.equal(items[0].nextDay,false);
 assert.equal(items[1].endsAt,'01:05');assert.equal(items[1].nextDay,true);
});
test('v160: strict dates reject impossible calendar days (leap year included)',()=>{
 for(const d of ['','2026-02-29','2026-04-31','2026-13-01','2025-2-02','1900-01-01','2101-01-01'])
  assert.equal(validTimelineDay(d),false,d);
 assert.equal(validTimelineDay('2028-02-29'),true);
 assert.equal(shiftTimelineDay('2028-02-28',1),'2028-02-29');
 assert.equal(shiftTimelineDay('2026-12-31',1),'2027-01-01');
 assert.equal(shiftTimelineDay('2000-01-01',-1),null);
 assert.equal(shiftTimelineDay('2100-12-31',1),null);
 assert.equal(shiftTimelineDay('bad',1),null);
 assert.equal(shiftTimelineDay(day,1.5),null);
});
test('v160: malformed records are skipped rather than rendered as an occupied slot',()=>{
 const rows=[row(1),row(1),row(2,'24:00'),row(3,'09:60'),row(4,'09:30','approved'),
  row(5,'09:30','confirmed',{duration:0}),row(6,'09:30','confirmed',{duration:1441}),
  row(7,'09:30','confirmed',{id:'7'}),row(8,'09:30','confirmed',{date:'2026-11-22'})];
 const result=buildBookingTimeline(rows,day);
 assert.deepEqual(result.items.map(i=>i.id),[1]);
 assert.equal(result.invalidCount,7);
 assert.deepEqual(buildBookingTimeline(null,day),{items:[],invalidCount:0,sourceValid:false});
 assert.throws(()=>buildBookingTimeline([], '2026-02-30'));
});
test('v160: labels are text-only and sanitized before they reach the React UI',()=>{
 const {items}=buildBookingTimeline([row(2,'08:00','pending',{customer:'\nPrivate',service:'A\u0000B'}),
  row(3,'09:00','confirmed',{customer:'  Nodira  ',service:' Soch olish '})],day);
 assert.equal(items[0].customer,'Mijoz');assert.equal(items[0].service,'Xizmat');
 assert.equal(items[1].customer,'Nodira');assert.equal(items[1].service,'Soch olish');
});
test('v160: texts are localized for Uzbek, Russian and English',()=>{
 for(const lang of ['uz','ru','en']){
  const t=bookingTimelineText(lang);
  for(const field of ['title','previous','next','today','selectDate','invalid','unavailable','pending','confirmed','completed','cancelled','rejected'])
   assert.ok(typeof t[field]==='string'&&t[field].length>2,`${lang}: ${field}`);
 }
 assert.notEqual(bookingTimelineText('ru').title,bookingTimelineText('uz').title);
 assert.equal(bookingTimelineText('xx'),bookingTimelineText('uz'));
});
test('v160: timeline is read-only and linked to barber Bookings with existing status gate',()=>{
 const component=file('components/BookingDayTimelineV160.jsx');
 const page=file('Bookings.jsx');
 assert.match(page,/<BookingDayTimelineV160 bookings=\{bookings\} status=\{status\} lang=\{lang\}/);
 assert.match(component,/status === 'ready' \? buildBookingTimeline/);
 assert.match(component,/type="date"/);
 assert.match(component,/aria-label=\{t\.selectDate\}/);
 assert.match(component,/aria-live="polite"/);
 assert.match(component,/role="alert"/);
 assert.match(component,/dateTime=/);
 assert.doesNotMatch(component,/request\(|setBookingStatus|fetch\(|innerHTML|localStorage|sessionStorage/);
});
test('v160: timeline uses Tashkent date, selected date is not an ISO UTC instant',()=>{
 const component=file('components/BookingDayTimelineV160.jsx');
 assert.match(component,/toISODate\(\)/);
 assert.match(component,/Asia\/Tashkent/);
 assert.match(component,/\+05:00/);
 assert.match(component,/shiftTimelineDay\(validDay,-1\)/);
 assert.match(component,/shiftTimelineDay\(validDay,1\)/);
});
