import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

// Run production ES modules without installing Vite/React; HTTP cases use a
// fake browser session and stub fetch. Not a replacement for browser/PG E2E.
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function loadModule(url) {
  let source = (await readFile(url, 'utf8')).replaceAll('import.meta.env','{"DEV":true}');
  for (const match of source.matchAll(/(from\s+|import\()(['"])([^'"]+)\2/g)) {
    const path = match[3].endsWith('.js') ? match[3] : `${match[3]}.js`;
    const dependency = await loadModule(new URL(path,url));
    source = source.replace(match[0], `${match[1]}${match[2]}${dependency}${match[2]}`);
  }
  return moduleURL(source);
}
const model = await import(await loadModule(new URL('../src/pages/user/bookings/model.js',import.meta.url)));
const { alternativeBookingUrl } = await import('../src/pages/user/bookings/cancellationAlternatives.js');
const now = Date.parse('2030-01-07T10:00:00Z');
const visit = (status, startsAt, id=1) => ({ id, status, startsAt, canCancel:true, cancellationPolicy:{} });
const old = visit('confirmed','2030-01-07T09:59:59Z');
const next = visit('confirmed','2030-01-07T10:00:01Z');
const pending = visit('pending','2030-01-07T11:00:00Z');
const finished = visit('completed','2030-01-07T09:00:00Z');

test('v127 #37 upcoming excludes overdue pending/confirmed regardless of stale server status', () => {
  assert.equal(model.matchesBookingFilter(old,'upcoming',now),false);
  assert.equal(model.matchesBookingFilter(next,'upcoming',now),true);
  assert.equal(model.matchesBookingFilter(pending,'upcoming',now),true);
  assert.equal(model.matchesBookingFilter(finished,'upcoming',now),false);
});
test('v127 #37 history includes overdue, keeping confirmed status unchanged', () => {
  assert.equal(model.matchesBookingFilter(old,'history',now),true);
  assert.equal(old.status,'confirmed');
  assert.equal(model.matchesBookingFilter(next,'history',now),false);
  assert.equal(model.matchesBookingFilter(finished,'history',now),true);
});
test('v127 #37 boundary instant belongs to history rather than future',()=>{
  const b=visit('pending','2030-01-07T10:00:00Z');
  assert.equal(model.matchesBookingFilter(b,'upcoming',now),false);
  assert.equal(model.isOverdueBooking(b,now),true);
  assert.equal(model.matchesBookingFilter(b,'history',now),true);
});
test('v127 #37 unknown URL status does not accidentally expose all results',()=>{
  assert.equal(model.matchesBookingFilter(next,'nonsense',now),false);
  assert.equal(model.matchesBookingFilter(next,'all',now),true);
  assert.equal(model.matchesBookingFilter(next,'confirmed',now),true);
});
test('v127 #37 invalid timestamps fail closed as upcoming',()=>{
  assert.equal(model.isUpcomingBooking(visit('confirmed','2030-02-31T10:00:00Z'),now),false);
  assert.equal(model.isUpcomingBooking(visit('confirmed','local-date'),now),false);
});
test('v127 #37 nearest confirmed is filtered and input order is preserved',()=>{
  const b2=visit('confirmed','2030-01-07T12:00:00Z',2), b1=visit('confirmed','2030-01-07T11:00:00Z',3);
  const original=[b2,old,b1];
  assert.equal(model.nearestBooking(original,now)?.id,3);
  assert.deepEqual(original,[b2,old,b1]);
  assert.equal(model.nearestBooking([old,pending],now),null);
});
test('v127 #17 no deadline cannot enable cancellation after appointment started',()=>{
  assert.equal(model.canCancel(old,now),false);
  assert.equal(model.canCancel(next,now),true);
  assert.equal(model.canCancel(visit('pending','2030-01-07T10:00:00Z'),now),false);
});
test('v127 #17 explicit cancellation cutoff still takes precedence',()=>{
  const b={...next,cancellationPolicy:{deadline:'2030-01-07T09:30:00Z'}};
  assert.equal(model.canCancel(b,now),false);
  const valid={...next,cancellationPolicy:{deadline:'2030-01-07T10:00:10Z'}};
  assert.equal(model.canCancel(valid,now),true);
});
test('v127 #17 invalid/missing booking date cannot enable cancellation',()=>{
  assert.equal(model.canCancel({status:'confirmed',canCancel:true},now),false);
  assert.equal(model.canCancel({...next,startsAt:'2030-02-31T13:00:00Z'},now),false);
});
test('v127 #87 rebook link accepts only existing valid service IDs',()=>{
  const b={barber:{id:23},services:[{id:34},{id:56}]};
  assert.equal(alternativeBookingUrl(b),'/user/barbers/23?services=34%2C56');
});
test('v127 #87 rebook falls back to exploration instead of passing bad service IDs',()=>{
  for(const services of [[{id:34},{id:34}],[{id:'34'}],[{id:null}],[]])
    assert.equal(alternativeBookingUrl({barber:{id:23},services}),'/user/explore');
  assert.equal(alternativeBookingUrl({barber:{id:'23'},services:[{id:34}]}),'/user/explore');
});
const originalFetch=globalThis.fetch;
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
const storage=new Map();
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value),
  removeItem:key=>storage.delete(key),
}});
function session() {
  const payload={id:91,role:'customer',profileId:12,exp:Math.floor(Date.now()/1000)+3600};
  const token=`test.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
  storage.set('ustara-api-access-token',token);
  storage.set('ustara-session',JSON.stringify({role:'customer',phone:'+998901234567',accountId:91,profileId:12,authenticated:true,authSource:'backend',tokenExpiresAt:payload.exp*1000}));
}
const row={id:61,customer_id:12,barber_id:23,service_id:34,
  service_name:'Soch olish',duration_minutes:30,booking_time:'2030-01-07T05:00:00Z',
  booking_end:'2030-01-07T05:30:00Z',status:'confirmed'};
beforeEach(()=>{storage.clear();session();});
afterEach(()=>{storage.clear();globalThis.fetch=originalFetch;});
after(()=>{if(originalStorage)Object.defineProperty(globalThis,'sessionStorage',originalStorage);else delete globalThis.sessionStorage;});
test('v127 #52 consistent server end-time retains its original ISO display format',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify(row));
  assert.equal((await model.loadCustomerBooking(61)).endsAt,row.booking_end);
});
test('v127 #52 contradictory server end-time is rejected for detail and list',async()=>{
  for(const booking_end of ['2030-01-07T05:35:00Z','invalid', '2030-01-07T04:30:00Z']) {
    const bad={...row,booking_end};
    globalThis.fetch=async()=>new Response(JSON.stringify(bad));
    await assert.rejects(model.loadCustomerBooking(61),/bir-biriga mos emas/);
    globalThis.fetch=async()=>new Response(JSON.stringify([bad]));
    await assert.rejects(model.loadCustomerBookings(),/bir-biriga mos emas/);
  }
});
test('v127 #52 missing end-time uses a deterministic duration-based time',async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({...row,booking_end:null}));
  assert.equal((await model.loadCustomerBooking(61)).endsAt,'2030-01-07T05:30:00.000Z');
});
test('v127 UI uses centralized filters and safe rebook helper',async()=>{
  const source=await readFile(new URL('../src/pages/user/Bookings.jsx',import.meta.url),'utf8');
  assert.match(source,/matchesBookingFilter\(booking, filter, clock\)/);
  assert.match(source,/nearestBooking\(visible, clock\)/);
  assert.match(source,/alternativeBookingUrl\(b\)/);
  assert.doesNotMatch(source,/service\.id \?\? 'missing'/);
  assert.match(source,/Bron vaqti o‘tgan/);
});
