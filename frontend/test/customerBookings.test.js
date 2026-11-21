import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Existing recursive loader handles lazy imports too. Only public Vite env is
// substituted; the real model/session/adapter run with mocked fetch and storage.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/(from\s+|import\()(['"])([^'"]+)\2/g)) {
    const path = match[3].endsWith('.js') ? match[3] : `${match[3]}.js`;
    const dependency = await loadModule(new URL(path, url));
    source = source.replace(match[0], `${match[1]}${match[2]}${dependency}${match[2]}`);
  }
  return moduleUrl(source);
}
const model = await import(await loadModule(new URL("../src/pages/user/bookings/model.js", import.meta.url)));
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} });
function session(role = "customer", version = 1) {
  const claims = { id: 91, profileId: 12, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.v${version}`;
  storage.set("ustara-api-access-token", token);
  storage.set("ustara-session", JSON.stringify({ role, phone: "+998901234567", accountId: 91,
    profileId: 12, authSource: "backend", authenticated: true, tokenExpiresAt: claims.exp * 1000 }));
  return token;
}
beforeEach(() => { storage.clear(); session(); });
afterEach(() => { globalThis.fetch = originalFetch; storage.clear(); });
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});
const row = { id: 61, customer_id: 12, barber_id: 23, service_id: 34,
  customer_first_name: "Vali", customer_last_name: "Aliyev", barber_first_name: "Ali", barber_last_name: "Valiyev",
  service_name: "Soch olish", booking_time: "2030-01-07T05:00:00Z", booking_end: "2030-01-07T05:30:00Z",
  duration_minutes: 30, status: "pending", created_at: "2026-11-15T00:00:00Z" };

test("GET list uses current JWT and maps real names, IDs, time, duration and all statuses", async () => {
  const token = session();
  const statuses = ["pending", "confirmed", "completed", "cancelled", "rejected"];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://localhost:5000/api/bookings");
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(options.body, undefined);
    return new Response(JSON.stringify(statuses.map((status, index) => ({ ...row, id: 61 + index, status }))));
  };
  const bookings = await model.loadCustomerBookings();
  assert.deepEqual(bookings.map((booking) => booking.status), statuses);
  assert.deepEqual(bookings.map((booking) => model.canCancel(booking)), [true, true, false, false, false]);
  assert.equal(model.barberName(bookings[0]), "Ali Valiyev");
  assert.equal(bookings[0].barber.id, 23);
  assert.deepEqual(bookings[0].services, [{ id: 34, name: "Soch olish", durationMinutes: 30 }]);
  assert.equal(bookings[0].startsAt, row.booking_time);
  assert.equal(bookings[0].endsAt, row.booking_end);
  assert.equal(model.dateLabel(bookings[0].startsAt, bookings[0].timezone, true), "10:00");
  assert.equal(bookings[0].isDemo, false);
  assert.equal(bookings[0].totalPrice, undefined);
  assert.equal(bookings[0].salon, undefined);
  assert.deepEqual(bookings[0].history, []);
});

test("GET detail uses the real booking ID and latest session token", async () => {
  const token = session("customer", 2);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://localhost:5000/api/bookings/61");
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
    return new Response(JSON.stringify(row));
  };
  const booking = await model.loadCustomerBooking("61");
  assert.equal(booking.id, 61);
  assert.equal(booking.customer_id, 12);
});

test("PUT cancellation sends only cancelled, then a server reload returns the updated list", async () => {
  const calls = [];
  let saved = { ...row };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${storage.get("ustara-api-access-token")}`);
    if (options.method === "PUT") {
      assert.equal(url, "http://localhost:5000/api/bookings/61");
      assert.deepEqual(JSON.parse(options.body), { status: "cancelled" });
      saved = { ...saved, status: "cancelled" };
      const raw = { id: saved.id, customer_id: 12, barber_id: 23, service_id: 34, booking_time: saved.booking_time,
        duration_minutes: 30, status: saved.status, created_at: saved.created_at };
      return new Response(JSON.stringify({ message: "Booking holati yangilandi", data: raw }));
    }
    return new Response(JSON.stringify(url.endsWith("/61") ? saved : [saved]));
  };
  const cancelled = await model.cancelCustomerBooking(61);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(model.canCancel(cancelled), false);
  const list = await model.loadCustomerBookings();
  const detail = await model.loadCustomerBooking(61);
  assert.equal(list[0].status, "cancelled");
  assert.equal(detail.status, "cancelled");
  assert.equal(model.barberName(detail), "Ali Valiyev");
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET", "GET"]);
});

test("empty server list stays empty without local demo fallback", async () => {
  globalThis.fetch = async () => new Response("[]");
  assert.deepEqual(await model.loadCustomerBookings(), []);
});

test("foreign customer records are rejected for list, detail and cancellation", async () => {
  const foreign = { ...row, customer_id: 99 };
  for (const action of ["list", "detail", "cancel"]) {
    globalThis.fetch = async () => new Response(JSON.stringify(action === "list" ? [foreign] : action === "cancel" ? { data: foreign } : foreign));
    await assert.rejects(action === "list" ? model.loadCustomerBookings()
      : action === "detail" ? model.loadCustomerBooking(61) : model.cancelCustomerBooking(61), { status: 403 });
  }
});

test("missing/customer-incompatible session makes no backend request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  for (const role of [null, "barber"]) {
    if (role) session(role); else storage.clear();
    await assert.rejects(model.loadCustomerBookings(), { status: 401 });
    await assert.rejects(model.loadCustomerBooking(61), { status: 401 });
    await assert.rejects(model.cancelCustomerBooking(61), { status: 401 });
  }
  assert.equal(calls, 0);
});

test("404 and server errors preserve API details and are not empty successes", async () => {
  for (const status of [404, 500]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Backend error", code: "backend_code", retryAfter: 30 }), { status });
    await assert.rejects(model.loadCustomerBooking(61), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.code, "backend_code");
      assert.equal(error.message, "Backend error");
      assert.deepEqual(error.metadata, { retryAfter: 30 });
      return true;
    });
  }
});

test("malformed response, wrong detail ID and unconfirmed cancellation fail validation", async () => {
  globalThis.fetch = async () => new Response('{"bookings":[]}');
  await assert.rejects(model.loadCustomerBookings());
  globalThis.fetch = async () => new Response(JSON.stringify({ ...row, id: 62 }));
  await assert.rejects(model.loadCustomerBooking(61), /boshqa booking/);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: row }));
  await assert.rejects(model.cancelCustomerBooking(61), /Server cancellation not confirmed/);
});

test('rescheduling shows only owner-scoped available slots and keeps 30-minute saved duration', async () => {
  const booking = { id: 61, durationMinutes: 30, startsAt: row.booking_time };
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/bookings/61/modify-slots');
    assert.equal(new URL(url).searchParams.get('date'), '2030-01-07');
    assert.equal(options.method, 'GET');
    assert.ok(new Headers(options.headers).get('Authorization')?.startsWith('Bearer '));
    return new Response(JSON.stringify({date:'2030-01-07',duration:30,working:true,accepting_bookings:true,
      slots:[{start:'10:00',end:'10:30'},{start:'11:00',end:'11:30'}]}));
  };
  const result = await model.loadRescheduleSlots(booking, '2030-01-07');
  assert.deepEqual(result.slots.map(slot => slot.start), ['10:00','11:00']);
});

test('PATCH reschedule submits original booking time and accepts only verified server result', async () => {
  const booking = { id: 61, barber: { id: 23 }, durationMinutes: 30, startsAt: row.booking_time };
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/bookings/61/modify');
    assert.equal(options.method, 'PATCH');
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { booking_time: '2030-01-07T11:00:00+05:00', expected_booking_time: booking.startsAt });
    return new Response(JSON.stringify({data:{id:61,customer_id:12,barber_id:23,status:'confirmed',duration_minutes:30,booking_time:'2030-01-07T06:00:00.000Z'}}));
  };
  assert.equal((await model.rescheduleCustomerBooking(booking,'2030-01-07','11:00')).id,61);
  globalThis.fetch = async()=>new Response(JSON.stringify({data:{id:999,booking_time:'2030-01-07T06:00:00.000Z'}}));
  await assert.rejects(model.rescheduleCustomerBooking(booking,'2030-01-07','11:00'),/tasdiqlanmadi/);
});

test('v17: cancellation cutoff is derived from the booking snapshot and enforced in display', async () => {
  const cutoffRow = { ...row, cancellation_cutoff_minutes: 60, cancellation_policy_text: '1 soat oldin' };
  const preview = model.cancellationPolicyFromRow(cutoffRow);
  assert.deepEqual(preview, { text: '1 soat oldin', deadline: '2030-01-07T04:00:00.000Z', fee: 0 });
  assert.equal(model.canCancel({status:'confirmed',canCancel:true,startsAt:row.booking_time,cancellationPolicy:preview}, Date.parse('2030-01-07T03:59:59Z')),true);
  assert.equal(model.canCancel({status:'confirmed',canCancel:true,startsAt:row.booking_time,cancellationPolicy:preview}, Date.parse('2030-01-07T04:00:00Z')),false);
  assert.equal(model.cancellationPolicyFromRow({ ...row, cancellation_cutoff_minutes:null }).deadline,undefined);
  globalThis.fetch = async () => new Response(JSON.stringify(cutoffRow));
  const loaded = await model.loadCustomerBooking(61);
  assert.equal(loaded.cancellationPolicy.deadline,preview.deadline);
  assert.equal(loaded.cancellationPolicy.fee,0);
});

test('v87: cancellation response after session switch is never displayed as new account success', async () => {
  let deliver;
  globalThis.fetch = () => new Promise(resolve => { deliver = resolve; });
  const pending = model.cancelCustomerBooking(61);
  for (let i=0; !deliver && i<40; i++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(deliver, 'cancellation request must have been sent');
  session('customer', 2); // rotated token, even if customer profile stayed the same
  deliver(new Response(JSON.stringify({ data: { ...row, status:'cancelled' } })));
  await assert.rejects(pending, { status:409, code:'session_changed' });
});

test('v87: reschedule response after account switch cannot confirm old account mutation', async () => {
  let deliver;
  globalThis.fetch = () => new Promise(resolve => { deliver = resolve; });
  const booking = { id:61, barber:{id:23},startsAt:row.booking_time,services:[{id:34}] };
  const pending = model.rescheduleCustomerBooking(booking,'2030-01-07','11:00');
  for (let i=0; !deliver && i<40; i++) await new Promise(resolve=>setImmediate(resolve));
  assert.ok(deliver, 'reschedule request must have been sent');
  session('barber', 2);
  deliver(new Response(JSON.stringify({ data:{id:61,customer_id:12,barber_id:23,
    booking_time:'2030-01-07T06:00:00Z',duration_minutes:30,status:'confirmed'} })));
  await assert.rejects(pending, { status:409, code:'session_changed' });
});


test('v125: owned booking detail maps server barber contact, salon and GPS without leaking customer phone', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ...row,
    barber_salon_name:'Ustara', barber_address:'Shayxontohur, Toshkent',
    barber_latitude:41.32,barber_longitude:69.24,barber_phone:'+998901234567',customer_phone:'+998990000000',
  }));
  const booking=await model.loadCustomerBooking(61);
  assert.deepEqual(booking.salon,{name:'Ustara',address:'Shayxontohur, Toshkent',location:{lat:41.32,lng:69.24}});
  assert.equal(booking.barber.phone,'+998901234567');
  assert.equal(Object.hasOwn(booking,'customer_phone'),false);
});

test('v125: invalid server contact and position cannot make actionable customer booking links', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ...row,
    barber_salon_name:'',barber_address:'',barber_latitude:200,barber_longitude:69.24,
    barber_phone:'javascript:alert(1)',customer_phone:'+998990000000',
  }));
  const booking=await model.loadCustomerBooking(61);
  assert.equal(booking.salon,undefined);
  assert.equal(booking.barber.phone,undefined);
  assert.equal(Object.hasOwn(booking,'customer_phone'),false);
});
