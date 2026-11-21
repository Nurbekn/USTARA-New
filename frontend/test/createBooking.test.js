import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const dependency = await loadModule(new URL(match[1], url));
    source = source.replace(match[0], `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const { createBooking, createBookingSubmitter } = await import(
  await loadModule(new URL("../src/pages/user/barber/createBooking.js", import.meta.url)));
const { loadAvailableSlots } = await import(
  await loadModule(new URL("../src/pages/user/barber/availableSlots.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const selection = { barberId: 23, serviceId: 34, date: "2030-01-07", time: "10:00", token: "test-session-jwt" };
const result = { message: "Booking yaratildi", data: { id: 61, customer_id: 12, barber_id: 23,
  service_id: 34, booking_time: "2030-01-07T05:00:00.000Z", duration_minutes: 45, status: "confirmed" } };

test("POST uses exact controller body and JWT with explicit Tashkent offset", async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "http://localhost:5000/api/bookings");
    assert.equal(options.method, "POST");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${selection.token}`);
    assert.equal(options.credentials, "omit");
    assert.deepEqual(JSON.parse(options.body), { barber_id: 23, service_id: 34, booking_time: "2030-01-07T10:00:00+05:00" });
    return new Response(JSON.stringify(result), { status: 201 });
  };
  assert.deepEqual(await createBooking(selection), result);
  assert.equal(calls, 1);
});

test("success preserves server ID, status and duration instead of assigning pending", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(result), { status: 201 });
  const saved = await createBooking({ ...selection, duration: 30, status: "pending" });
  assert.equal(saved.message, result.message);
  assert.equal(saved.data.id, 61);
  assert.equal(saved.data.status, "confirmed");
  assert.equal(saved.data.duration_minutes, 45);
});

test("duplicate submissions share one active POST", async () => {
  let finish, calls = 0;
  globalThis.fetch = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const submit = createBookingSubmitter();
  const first = submit(selection);
  const duplicate = submit(selection);
  assert.equal(first, duplicate);
  assert.equal(calls, 1);
  finish(new Response(JSON.stringify(result), { status: 201 }));
  assert.deepEqual(await first, result);
  assert.deepEqual(await duplicate, result);
});

test("409 preserves conflict details and slots can be reloaded without another POST", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === "POST") return new Response('{"message":"Bu vaqt band","code":"slot_conflict","retryAfter":1}', { status: 409 });
    return new Response(JSON.stringify({ date: selection.date, duration: 30, working: true,
      slots: [{ start: "11:00", end: "11:30" }], busy: [] }));
  };
  await assert.rejects(createBooking(selection), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.message, "Bu vaqt band");
    assert.equal(error.code, "slot_conflict");
    assert.deepEqual(error.metadata, { retryAfter: 1 });
    return true;
  });
  const refreshed = await loadAvailableSlots(selection);
  assert.deepEqual(refreshed.slots.map((slot) => slot.time), ["11:00"]);
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"]);
});

test("failed submission releases duplicate guard for a newly selected time", async () => {
  const times = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    times.push(body.booking_time);
    return times.length === 1 ? new Response('{"message":"Bu vaqt band"}', { status: 409 })
      : new Response(JSON.stringify({ ...result, data: { ...result.data, booking_time: "2030-01-07T06:00:00Z" } }), { status: 201 });
  };
  const submit = createBookingSubmitter();
  await assert.rejects(submit(selection), { status: 409 });
  await submit({ ...selection, time: "11:00" });
  assert.deepEqual(times, ["2030-01-07T10:00:00+05:00", "2030-01-07T11:00:00+05:00"]);
});

test("invalid selection or absent JWT never makes a POST", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  for (const change of [{ barberId: "demo-barber-1" }, { serviceId: 0 }, { date: "2030-02-30" }, { time: "24:00" }]) {
    await assert.rejects(createBooking({ ...selection, ...change }));
  }
  await assert.rejects(createBooking({ ...selection, token: undefined }), { status: 401 });
  assert.equal(calls, 0);
});

test("malformed success responses are not displayed as saved bookings or automatically retried", async () => {
  for (const body of [null, {}, { ...result, data: { ...result.data, barber_id: 24 } },
    { ...result, data: { ...result.data, status: null } }]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response(JSON.stringify(body), { status: 201 }); };
    await assert.rejects(createBooking(selection), /Booking javobini qayta ishlashda xatolik/);
    assert.equal(calls, 1);
  }
});

test('ko‘p xizmat POST faqat IDlar va vaqtni yuboradi; narx serverdan olinadi', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { barber_id:23, service_ids:[34,35], booking_time:'2030-01-07T10:00:00+05:00' });
    return new Response(JSON.stringify({ ...result, data:{ ...result.data, duration_minutes:30, total_price:'75000.00', services:[{id:34},{id:35}] } }), {status:201});
  };
  assert.equal((await createBooking({...selection, serviceIds:[34,35], total_price:1})).data.total_price,'75000.00');
});
test('takroriy va bo‘sh xizmat tanlovi POST yubormaydi', async () => {
  globalThis.fetch = async () => { throw Error('So‘rov yuborilmasligi kerak'); };
  await assert.rejects(createBooking({...selection,serviceIds:[]}));
  await assert.rejects(createBooking({...selection,serviceIds:[34,34]}));
});


test('lost response retries SAME request ID and receives previous booking', async () => {
  const sent=[];
  globalThis.fetch = async (_url, options) => {
    const req=JSON.parse(options.body);sent.push(req.request_id);
    if (sent.length === 1) throw new TypeError('connection lost');
    return new Response(JSON.stringify(result), { status:200 });
  };
  const submit=createBookingSubmitter();
  await assert.rejects(submit(selection), {code:'network_error'});
  assert.deepEqual(await submit(selection), result);
  assert.equal(sent.length,2);
  assert.match(sent[0],/^[0-9a-f]{8}-/);
  assert.equal(sent[0],sent[1]);
});

test('explicit conflict discards old key, new selection gets a new key', async () => {
  const ids=[];
  globalThis.fetch = async (_url, options) => {
    ids.push(JSON.parse(options.body).request_id);
    return ids.length===1 ? new Response('{"message":"Band"}',{status:409})
      : new Response(JSON.stringify({...result,data:{...result.data, booking_time:'2030-01-07T06:00:00Z'}}),{status:201});
  };
  const submit=createBookingSubmitter();
  await assert.rejects(submit(selection),{status:409});
  await submit({...selection,time:'11:00'});
  assert.notEqual(ids[0],ids[1]);
});


test('reload in same browser tab restores key after network failure without storing JWT', async () => {
  const previous = globalThis.sessionStorage;
  const entries = new Map();
  globalThis.sessionStorage = {getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};
  try {
    const ids=[];
    globalThis.fetch=async (_url,opts)=>{ids.push(JSON.parse(opts.body).request_id);
      if(ids.length===1)throw new TypeError('lost');
      return new Response(JSON.stringify(result),{status:200});};
    await assert.rejects(createBookingSubmitter()(selection),{code:'network_error'});
    const stored=Array.from(entries.values()).join('');
    assert.doesNotMatch(stored,/test-session-jwt/);
    assert.deepEqual(await createBookingSubmitter()(selection),result);
    assert.equal(ids[0],ids[1]);
    assert.equal(entries.size,0);
  } finally { if (previous===undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage=previous; }
});

test('confirmed total is quoted to server for comparison, not used as authoritative price', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.expected_total_price, '75000.00');
    assert.equal(body.total_price, undefined, 'client may not set actual booking price');
    return new Response(JSON.stringify({ ...result, data: { ...result.data, total_price: '75000.00' } }), { status: 201 });
  };
  const booking = await createBooking({ ...selection, expectedTotalPrice: '75000.00' });
  assert.equal(booking.data.total_price, '75000.00');
});

test('incorrect quote is rejected before any request', async () => {
  globalThis.fetch = async () => { throw new Error('No fetch allowed'); };
  await assert.rejects(createBooking({ ...selection, expectedTotalPrice: '-100' }), /Narxni qayta tekshiring/);
});

test('network retry retains request id even when server quote has since changed', async () => {
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    if (sent.length === 1) throw new TypeError('connection lost');
    // A quoted success must include its authoritative server price.
    return new Response(JSON.stringify({...result, data:{...result.data,total_price:'60000.00'}}), { status: 200 });
  };
  const submit = createBookingSubmitter();
  await assert.rejects(submit({ ...selection, expectedTotalPrice: '50000.00' }), { code: 'network_error' });
  await submit({ ...selection, expectedTotalPrice: '60000.00' });
  assert.equal(sent[0].request_id, sent[1].request_id);
  assert.equal(sent[0].expected_total_price, '50000.00');
  assert.equal(sent[1].expected_total_price, '60000.00');
});

test('v17: booking sends previewed cancellation terms but does not set stored terms',async()=>{
  const expectedCancellationPolicy={cutoff_minutes:60,text:'Oldindan xabar bering'};
  globalThis.fetch=async (_url,opts)=>{
    const body=JSON.parse(opts.body);
    assert.deepEqual(body.expected_cancellation_policy,expectedCancellationPolicy);
    assert.equal(body.cancellation_cutoff_minutes,undefined);
    assert.equal(body.cancellation_policy_text,undefined);
    return new Response(JSON.stringify(result),{status:201});
  };
  assert.deepEqual(await createBooking({...selection,expectedCancellationPolicy}),result);
});
test('postgres int4 dan katta IDlar serverga yuborilmaydi', async()=>{
 let requests=0; globalThis.fetch=async()=>{requests++;throw Error('POST yuborilmasligi kerak')};
 await assert.rejects(createBooking({...selection,barberId:2147483648}));
 await assert.rejects(createBooking({...selection,serviceId:2147483648}));
 await assert.rejects(createBooking({...selection,serviceIds:[34,2147483648]}));
 assert.equal(requests,0);
});
test('5 daqiqalik qadamdan tashqari vaqt serverga yuborilmaydi', async()=>{
 let requests=0; globalThis.fetch=async()=>{requests++;throw Error('POST yuborilmasligi kerak')};
 for (const time of ['10:01','10:03','10:59']) await assert.rejects(createBooking({...selection,time}));
 assert.equal(requests,0);
});
