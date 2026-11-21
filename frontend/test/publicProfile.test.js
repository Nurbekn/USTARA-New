import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Existing loader pattern: real model/adapter with mocked fetch, no .env files.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function loadModule(url) {
  let source = (await readFile(url, "utf8")).replaceAll("import.meta.env", '{"DEV":true}');
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const dependency = await loadModule(new URL(match[1], url));
    source = source.replace(match[0], `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const { loadBarberProfile } = await import(await loadModule(new URL("../src/pages/user/barber/publicProfile.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const token = "test-current-customer-jwt";
const barber = { id: 23, first_name: "Ali", last_name: "Valiyev", phone: "+998901234567",
  created_at: "2030-01-01T00:00:00Z", specialty: "stylist" };
const service = { id: 34, name: "Soch olish", price: "50000.00", duration_minutes: 30, barber_id: 23 };
function transport(replies) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const reply = replies[calls.length - 1];
    assert.ok(reply, "Unexpected request");
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  };
  return calls;
}

test("loads actual barber ID and owned services with services, portfolio and reviews through authenticated GET requests", async () => {
  const calls = transport([{ body: barber }, { body: [service] }, { body: { posts: [] } }, { body: { reviews: [], summary: { count: 0, average: 0 } } }, { body: [] }]);
  const result = await loadBarberProfile("23", { token });
  assert.deepEqual(calls.map((call) => call.url), ["http://localhost:5000/api/barbers/23", "http://localhost:5000/api/services?barber_id=23", "http://localhost:5000/api/barbers/23/portfolio", "http://localhost:5000/api/barbers/23/reviews", "http://localhost:5000/api/barbers/23/working-hours"]);
  for (const { url, options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, "omit");
    assert.ok(!url.includes(token));
  }
  assert.deepEqual(result.barber, barber);
  assert.deepEqual(result.details.services, [{ ...service, price: 50000 }]);
  assert.deepEqual(result.details.posts, []);
  assert.deepEqual(result.details.hours, []);
  assert.equal(result.barber.rating, undefined);
  assert.equal(result.barber.location, undefined);
  assert.equal(result.details.experience, undefined);
});

test("barber with no services is a successful profile, not a missing profile", async () => {
  transport([{ body: barber }, { body: [] }, { body: { posts: [] } }, { body: { reviews: [], summary: { count: 0, average: 0 } } }, { body: [] }]);
  const result = await loadBarberProfile("23", { token });
  assert.deepEqual(result.barber, barber);
  assert.deepEqual(result.details.services, []);
});

test("barber 404 and authentication/server failures propagate without sample fallback", async () => {
  for (const status of [404, 401, 500]) {
    const calls = transport([{ status, body: { message: "Backend message", code: "backend_code" } }]);
    await assert.rejects(loadBarberProfile("23", { token }), { status, message: "Backend message", code: "backend_code" });
    assert.equal(calls.length, 1);
  }
});

test("service errors preserve API metadata and are distinct from barber not found", async () => {
  transport([{ body: barber }, { status: 404, body: { message: "Service request failed", code: "not_found", retryAfter: 30 } }]);
  await assert.rejects(loadBarberProfile("23", { token }), (error) => {
    assert.equal(error.status, 404);
    assert.equal(error.resource, "services");
    assert.equal(error.code, "not_found");
    assert.deepEqual(error.metadata, { retryAfter: 30 });
    return true;
  });
});

test("invalid route IDs never contact the backend", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  for (const id of ["demo-barber-1", "0", "-1", "23/../24", "NaN"]) {
    await assert.rejects(loadBarberProfile(id, { token }), { status: 404 });
  }
  assert.equal(calls, 0);
});

test("malformed or mismatched profile/service responses are rejected", async () => {
  for (const body of [null, [], { ...barber, id: 24 }]) {
    transport([{ body }]);
    await assert.rejects(loadBarberProfile("23", { token }), { message: "Serverdan sartarosh profili olinmadi." });
  }
  for (const body of [null, { services: [service] }, [{ ...service, barber_id: 24 }],
    [{ ...service, price: "invalid" }], [{ ...service, duration_minutes: 0 }]]) {
    transport([{ body: barber }, { body }]);
    await assert.rejects(loadBarberProfile("23", { token }), { message: "Serverdan xizmatlar ro‘yxati olinmadi." });
  }
});

test("caller cancellation propagates to the adapter request", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_url, { signal }) => { signal.throwIfAborted(); };
  controller.abort();
  await assert.rejects(loadBarberProfile("23", { token, signal: controller.signal }), { code: "request_aborted" });
});

test("ish jadvali va media API manzillari profilga ulanadi", async () => {
  transport([{body:barber},{body:[service]},{body:{posts:[{id:5,media:[{type:'image',url:'/api/media/8'}]}]}},{body:{reviews:[],summary:{count:0,average:0}}},{body:[{day_of_week:1,start_time:'09:00:00',end_time:'18:00:00'}]}]);
  const result=await loadBarberProfile('23',{token});
  assert.equal(result.details.hours[0].start_time,'09:00');
  assert.equal(result.details.posts[0].media[0].url,'http://localhost:5000/api/media/8');
});
test("jadval API xatosi butun profilni buzmaydi va texnik matnni chiqarmaydi",async()=>{
  transport([{body:barber},{body:[]},{body:{posts:[]}},{body:{reviews:[],summary:{count:0,average:0}}},{status:500,body:{message:'internal SQL private error'}}]);
  const result=await loadBarberProfile('23',{token});assert.equal(result.barber.id,23);assert.deepEqual(result.details.hours,[]);assert.equal(result.details.errors.hours,'Ish jadvalini yuklab bo‘lmadi.');
});


test('guest reads approved public barber, services, published portfolio and reviews without a JWT', async () => {
  const publicPost = { id: 5, media: [{ type: 'image', url: '/api/media/8' }] };
  const publicReview = { id: 9, customer: 'Malika', rating: 5, text: 'Zo‘r', reply: '' };
  const calls = transport([{ body: barber }, { body: [service] },
    { body: { posts: [publicPost], followerCount: 2, followingCount: 0 } },
    { body: { reviews: [publicReview], summary: { count: 1, average: 5 } } }, { body: [] }]);
  const result = await loadBarberProfile('23');
  assert.deepEqual(calls.map(call => new URL(call.url).pathname), [
    '/api/barbers/23', '/api/services/public', '/api/barbers/23/portfolio',
    '/api/barbers/23/reviews', '/api/barbers/23/working-hours',
  ]);
  assert.ok(calls.every(call => !new Headers(call.options.headers).has('Authorization')));
  assert.equal(result.details.services[0].id,34);
  assert.equal(result.details.posts[0].media[0].url,'http://localhost:5000/api/media/8');
  assert.deepEqual(result.details.reviews, [publicReview]);
  assert.equal(result.details.reviewSummary.average, 5);
  assert.equal(result.details.errors.posts, undefined);
  assert.equal(result.details.errors.reviews, undefined);
});

test('guest public post/review errors stay within their tabs and do not block booking', async () => {
  transport([{ body: barber }, { body: [service] },
    { status: 503, body: { message: 'private SQL details' } },
    { body: { reviews: 'bad-shape' } }, { body: [] }]);
  const result = await loadBarberProfile('23');
  assert.equal(result.details.services[0].id,34);
  assert.deepEqual(result.details.posts, []);
  assert.deepEqual(result.details.reviews, []);
  assert.equal(result.details.errors.posts, 'Postlarni yuklab bo‘lmadi.');
  assert.equal(result.details.errors.reviews, 'Sharhlarni yuklab bo‘lmadi.');
  assert.doesNotMatch(JSON.stringify(result), /private SQL details/);
});

test('v116 / malformed post media is isolated to post tab instead of crashing booking', async () => {
  for (const posts of [[null], [{ id: 9, media: null }], [{ id: 9, media: [{ type: 'image', url: 'javascript:alert(1)' }] }]]) {
    transport([{ body: barber }, { body: [service] }, { body: { posts } }, { body: { reviews: [], summary: { count: 0, average: 0 } } }, { body: [] }]);
    const result = await loadBarberProfile('23', { token });
    assert.equal(result.barber.id, 23);
    assert.equal(result.details.services[0].id, 34);
    assert.deepEqual(result.details.posts, []);
    assert.equal(result.details.errors.posts, 'Postlarni yuklab bo‘lmadi.');
  }
});

test('v116 / authenticated valid video media remains available for portfolio', async () => {
  transport([{ body: barber }, { body: [service] }, { body: { posts: [{ id: 9, media: [{ type: 'video', url: '/api/media/19' }] }] } }, { body: { reviews: [], summary: { count: 0, average: 0 } } }, { body: [] }]);
  const result = await loadBarberProfile('23', { token });
  assert.deepEqual(result.details.posts[0].media, [{ type: 'video', url: 'http://localhost:5000/api/media/19' }]);
  assert.equal(result.details.errors.posts, undefined);
});
