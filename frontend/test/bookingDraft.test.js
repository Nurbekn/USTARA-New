import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_KEY, DRAFT_TTL_MS, readBookingDraft, saveBookingDraft, clearBookingDraft, bookingDraftResumePath } from '../src/pages/user/barber/bookingDraft.js';
const data = { barberId: 23, serviceIds: [34, 35], date: '2030-01-07', time: '10:05', token: 'NEVER_SAVE_ME', phone: '+998901234567' };
function store() { const map = new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}; }

test('draft stores only selection fields; never token, phone or quoted price', () => {
  const s=store();assert.equal(saveBookingDraft(data,s,1000000),true);
  const raw=s.getItem(DRAFT_KEY);
  assert.doesNotMatch(raw,/NEVER_SAVE_ME|998901234567|token|phone/);
  assert.deepEqual(readBookingDraft(s,1000000).serviceIds,[34,35]);
  assert.equal(bookingDraftResumePath(s,1000000),'/user/barbers/23');
});
test('five-minute expiry invalidates draft without reserving any slot', () => {
  const s=store();saveBookingDraft(data,s,1000000);
  assert.equal(readBookingDraft(s,1000000+DRAFT_TTL_MS)?.time, '10:05');
  assert.equal(readBookingDraft(s,1000001+DRAFT_TTL_MS),null);
  assert.equal(s.getItem(DRAFT_KEY),null);
});
test('same selection does not extend draft expiry; changes set new time', () => {
  const s=store();saveBookingDraft(data,s,1000000);
  saveBookingDraft(data,s,1001000);
  assert.equal(readBookingDraft(s,1001000).createdAt,1000000);
  saveBookingDraft({...data,time:'10:10'},s,1002000);
  assert.equal(readBookingDraft(s,1002000).createdAt,1002000);
});
test('invalid ids, dates and times are rejected, corrupted storage is discarded', () => {
  const s=store();for(const patch of [{barberId:-1},{serviceIds:[34,34]},{serviceIds:[]},{date:'2030-02-30'},{time:'10:03'},{time:'25:00'},{serviceIds:[34,'35']}]) {
    assert.equal(saveBookingDraft({...data,...patch},s,1000),false);
  }
  s.setItem(DRAFT_KEY,'{"barberId":99}');assert.equal(readBookingDraft(s,1000),null);
  clearBookingDraft(s);assert.equal(s.getItem(DRAFT_KEY),null);
});
test('storage disabled is safe; no browser storage required to browse', () => {
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');},removeItem(){throw new Error('blocked');}};
  assert.equal(readBookingDraft(storage),null);
  assert.equal(saveBookingDraft(data,storage,1000),false);
  assert.doesNotThrow(()=>clearBookingDraft(storage));
});
test('int4 diapazonidan katta identifikatorli draft saqlanmaydi', () => {
 const s=store();
 assert.equal(saveBookingDraft({...data,barberId:2147483648},s,1000),false);
 assert.equal(saveBookingDraft({...data,serviceIds:[2147483648]},s,1000),false);
 assert.equal(saveBookingDraft({...data,serviceIds:[2147483647]},s,1000),true);
});
