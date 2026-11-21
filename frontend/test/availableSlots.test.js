import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { setImmediate } from "node:timers/promises";

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const dependency = await loadModule(new URL(match[1], url));
    source = source.replace(match[0], `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const { loadAvailableSlots, watchAvailableSlots } = await import(
  await loadModule(new URL("../src/pages/user/barber/availableSlots.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const params = { barberId: 23, serviceId: 34, date: "2030-01-07", token: "test-session-jwt" };
const response = (date = params.date) => ({ date, duration: 30, working: true,
  slots: [{ start: "10:00", end: "10:30" }], recommendedSlots: [], busy: [{ start: "09:00", end: "09:30" }] });

test("exact backend query and JWT are used; slots use server duration and start/end", async () => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/api/bookings/available-slots");
    assert.deepEqual(Object.fromEntries(parsed.searchParams), { barber_id: "23", service_id: "34", date: params.date });
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${params.token}`);
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, "omit");
    return new Response(JSON.stringify(response()));
  };
  const result = await loadAvailableSlots(params);
  assert.deepEqual(result.slots, [{ time: "10:00", endTime: "10:30", available: true, reason: "Bo‘sh" }]);
  assert.equal(result.duration, 30);
  assert.equal(result.busy, undefined);
  assert.deepEqual(result.recommendedSlots, []);
});

test("off days and fully occupied days remain empty without fabricated slots", async () => {
  for (const working of [false, true]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ date: params.date, duration: 30, working, slots: [], busy: [] }));
    const result = await loadAvailableSlots(params);
    assert.equal(result.working, working);
    assert.deepEqual(result.slots, []);
  }
});

test("HTTP errors preserve status/message/code and useful metadata", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Backend error", code: "service_unavailable", retryAfter: 30 }), { status: 403 });
  await assert.rejects(loadAvailableSlots(params), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, "Backend error");
    assert.equal(error.code, "service_unavailable");
    assert.deepEqual(error.metadata, { retryAfter: 30 });
    return true;
  });
});

test("invalid response or wrong date is rejected instead of presenting stale slots", async () => {
  for (const data of [null, response("2030-01-08"), { ...response(), slots: ["10:00"] },
    { ...response(), slots: [{ start: "10:00", end: "10:15" }] }]) {
    globalThis.fetch = async () => new Response(JSON.stringify(data));
    await assert.rejects(loadAvailableSlots(params), { message: "Serverdan bo‘sh vaqtlar olinmadi." });
  }
});

test("invalid IDs do not make a request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  await assert.rejects(loadAvailableSlots({ ...params, barberId: "demo-barber-1" }));
  await assert.rejects(loadAvailableSlots({ ...params, serviceId: 0 }));
  assert.equal(calls, 0);
});

for (const lateFailure of [false, true]) {
  test(`date/service change suppresses old ${lateFailure ? "failure" : "success"} even if transport ignores abort`, async () => {
    const pending = [];
    globalThis.fetch = (url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject }));
    const states = [];
    const oldCancel = watchAvailableSlots(params, (state) => states.push({ source: "old", ...state }));
    await setImmediate();
    oldCancel();
    const newParams = { ...params, serviceId: 35, date: "2030-01-08" };
    const newCancel = watchAvailableSlots(newParams, (state) => states.push({ source: "new", ...state }));
    try {
      await setImmediate();
      assert.equal(pending.length, 2);
      assert.equal(pending[0].options.signal.aborted, true);
      assert.equal(new URL(pending[1].url).searchParams.get("date"), newParams.date);
      assert.equal(new URL(pending[1].url).searchParams.get("service_id"), "35");
      pending[1].resolve(new Response(JSON.stringify(response(newParams.date))));
      await setImmediate();
      const count = states.length;
      if (lateFailure) pending[0].reject(new TypeError("Late network failure"));
      else pending[0].resolve(new Response(JSON.stringify(response())));
      await setImmediate();
      assert.equal(states.length, count);
      assert.equal(states.at(-1).source, "new");
      assert.equal(states.at(-1).status, "ready");
      assert.equal(states.at(-1).data.date, newParams.date);
      assert.deepEqual(states.filter((state) => state.source === "old").map((state) => state.status), ["loading"]);
    } finally { oldCancel(); newCancel(); }
  });
}

test("failed load can be retried and progresses from loading to ready", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response('{"message":"Retry later"}', { status: 500 })
    : new Response(JSON.stringify(response()));
  const states = [];
  const stopFirst = watchAvailableSlots(params, (state) => states.push(state.status));
  await setImmediate();
  stopFirst();
  const stopRetry = watchAvailableSlots(params, (state) => states.push(state.status));
  await setImmediate();
  stopRetry();
  assert.deepEqual(states, ["loading", "error", "loading", "ready"]);
});

test('jami davomiylikka mos faqat bo‘sh 5 daqiqalik vaqtlar ko‘rsatiladi', async () => {
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get('service_ids'),'34,35');
    return new Response(JSON.stringify({date:params.date,duration:30,working:true,slots:[{start:'09:35',end:'10:05'}],candidates:[{start:'09:30',end:'10:00',available:false},{start:'09:35',end:'10:05',available:true}]}),{status:200});
  };
  const data=await loadAvailableSlots({...params,serviceIds:[34,35]});
  assert.deepEqual(data.slots.map(slot=>[slot.time,slot.endTime,slot.available]),[['09:35','10:05',true]]);
});


test('guest sees live available slots without JWT and never receives customer identities', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/bookings/available-slots');
    assert.equal(new Headers(options.headers).get('Authorization'), null);
    return new Response(JSON.stringify({date:params.date,duration:30,working:true,
      total_price:'45000.00',candidates:[{start:'10:00',end:'10:30',available:true}],slots:[{start:'10:00',end:'10:30'}]}));
  };
  const result = await loadAvailableSlots({...params,token:undefined});
  assert.equal(result.slots[0].time,'10:00');
  assert.equal(result.total_price,'45000.00');
  assert.equal(result.busy,undefined);
});
