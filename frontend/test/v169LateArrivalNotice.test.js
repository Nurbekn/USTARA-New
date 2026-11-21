import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lateNoticeAllowed,lateNoticeUi,parseLateNotice} from '../src/pages/user/bookings/lateNoticeV169.js';
const start='2026-11-21T11:00:00.000Z';
test('#101 notice limited to active bookings within server-equivalent UI time window',()=>{
 const b={id:91,status:'confirmed',startsAt:start};const s=Date.parse(start);
 assert.equal(lateNoticeAllowed(b,s-2*60*60*1000),true);
 assert.equal(lateNoticeAllowed(b,s-2*60*60*1000-1),false);
 assert.equal(lateNoticeAllowed(b,s+10*60*1000),true);
 assert.equal(lateNoticeAllowed(b,s+10*60*1000+1),false);
 assert.equal(lateNoticeAllowed({...b,status:'cancelled'},s),false);
 assert.equal(lateNoticeAllowed({...b,lateNotice:{minutes:10}},s),false);
});
test('#101 untrusted notice state is sanitized, no internal fields are exposed',()=>{
 assert.deepEqual(parseLateNotice({minutes:10,reportedAt:start,private:'x'}),{minutes:10,reportedAt:start});
 assert.equal(parseLateNotice(null),null);
 assert.throws(()=>parseLateNotice({minutes:90,reportedAt:start}));
 assert.throws(()=>parseLateNotice({minutes:5,reportedAt:'not-a-date'}));
});
test('#101 interface has explicit Uzbek Russian English and barber/customer views',()=>{
 for(const lang of ['uz','ru','en'])assert.ok(lateNoticeUi(lang).send && lateNoticeUi(lang).notConfirmed);
 const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
 assert.match(read('pages/user/Bookings.jsx'),/LateNoticeV169/);
 assert.match(read('pages/user/bookings/model.js'),/parseLateNotice\(row\.late_notice\)/);
 assert.match(read('pages/barber/components/BookingCard.jsx'),/booking\.lateNotice/);
 assert.match(read('pages/barber/data/store.js'),/lateNotice: row\.late_notice/);
});
