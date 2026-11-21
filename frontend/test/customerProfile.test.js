import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

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
const { loadCustomerProfile, saveCustomerProfileToServer } = await import(
  await loadModule(new URL("../src/pages/user/data/profile.js", import.meta.url)));
const originalFetch = globalThis.fetch;
const originals = new Map(["sessionStorage", "localStorage"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} });
let localReads = 0, localWrites = 0;
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: () => { localReads++; return JSON.stringify({ firstName: "Demo", avatarPhoto: "demo-photo", address: "Demo address" }); },
  setItem: () => { localWrites++; },
} });
function session(role = "customer", version = 1) {
  const claims = { id: 91, profileId: 12, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.v${version}`;
  storage.set("ustara-api-access-token", token);
  storage.set("ustara-session", JSON.stringify({ role, phone: "+998901234567", accountId: 91,
    profileId: 12, authSource: "backend", authenticated: true, tokenExpiresAt: claims.exp * 1000 }));
  return token;
}
beforeEach(() => { storage.clear(); session(); localReads = 0; localWrites = 0; });
afterEach(() => { globalThis.fetch = originalFetch; storage.clear(); });
after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const customer = { id: 12, first_name: "Ali", last_name: "Valiyev", phone: "+998901234567", created_at: "2026-11-15T00:00:00Z" };

test("GET me uses current JWT and maps actual profile without local demo values", async () => {
  const token = session("customer", 2);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://localhost:5000/api/customers/me");
    assert.equal(options.method, "GET");
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(options.body, undefined);
    return new Response(JSON.stringify({ customer }));
  };
  const profile = await loadCustomerProfile();
  assert.equal(profile.id, 12);
  assert.equal(profile.firstName, "Ali");
  assert.equal(profile.lastName, "Valiyev");
  assert.equal(profile.phone, customer.phone);
  assert.equal(profile.address, "");
  assert.equal(profile.birthDate, "");
  assert.equal(profile.location, null);
  assert.equal(profile.avatarPhoto, "");
  assert.equal(localReads, 0);
  assert.equal(localWrites, 0);
});

test("save uses ID returned by me, exact PUT fields and subsequent authoritative GET", async () => {
  const calls = [];
  const saved = { ...customer, first_name: "Alisher", last_name: "Valiyev" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${storage.get("ustara-api-access-token")}`);
    if (options.method === "PUT") {
      assert.equal(url, "http://localhost:5000/api/customers/12");
      assert.deepEqual(JSON.parse(options.body), { first_name: "Alisher", last_name: "Valiyev", avatar_url: null, address: "Not supported", location: null });
      return new Response(JSON.stringify({ message: "Mijoz ma'lumotlari yangilandi", data: saved }));
    }
    return new Response(JSON.stringify({ customer: calls.length === 1 ? customer : saved }));
  };
  const profile = await loadCustomerProfile();
  const updated = await saveCustomerProfileToServer({ ...profile, firstName: "Alisher", birthDate: "2000-01-01", address: "Not supported" });
  assert.equal(updated.firstName, "Alisher");
  assert.equal(updated.birthDate, "");
  assert.equal(updated.address, "");
  assert.deepEqual(calls.map((call) => call.method), ["GET", "PUT", "GET"]);
  assert.equal(localWrites, 0);
});

test("backend validation remains authoritative and retains error metadata", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options.method, "PUT");
    assert.deepEqual(JSON.parse(options.body), { first_name: "12", last_name: "Valiyev", avatar_url: null, address: null, location: null });
    return new Response(JSON.stringify({ message: "Backend validation", code: "invalid_name", field: "first_name" }), { status: 400 });
  };
  await assert.rejects(saveCustomerProfileToServer({ id: 12, firstName: "12", lastName: "Valiyev" }), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.code, "invalid_name");
    assert.equal(error.message, "Backend validation");
    assert.deepEqual(error.metadata, { field: "first_name" });
    return true;
  });
  assert.equal(calls, 1);
});

test("foreign profile ID cannot be saved and malformed/foreign GET data is rejected", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ customer: { ...customer, id: 99 } })); };
  await assert.rejects(saveCustomerProfileToServer({ id: 99, firstName: "Ali", lastName: "Vali" }), { status: 403 });
  assert.equal(calls, 0);
  await assert.rejects(loadCustomerProfile(), /Serverdan customer profili olinmadi/);
  globalThis.fetch = async () => new Response(JSON.stringify(customer));
  await assert.rejects(loadCustomerProfile(), /Serverdan customer profili olinmadi/);
});

test("missing session or non-customer role cannot save", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected request"); };
  for (const role of [null, "barber"]) {
    if (role) session(role); else storage.clear();
    await assert.rejects(saveCustomerProfileToServer({ id: 12, firstName: "Ali", lastName: "Vali" }), { status: 401 });
  }
  assert.equal(calls, 0);
});

test("initial load error can be retried without writing data", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, "GET");
    return ++calls === 1 ? new Response('{"message":"Unavailable"}', { status: 500 })
      : new Response(JSON.stringify({ customer }));
  };
  await assert.rejects(loadCustomerProfile(), { status: 500 });
  assert.equal((await loadCustomerProfile()).id, 12);
  assert.equal(calls, 2);
});

test("failed post-save reload is marked saved and can retry GET without repeating PUT", async () => {
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push(options.method);
    if (options.method === "PUT") return new Response(JSON.stringify({ data: customer }));
    return calls.length === 2 ? new Response('{"message":"Unavailable"}', { status: 500 })
      : new Response(JSON.stringify({ customer }));
  };
  await assert.rejects(saveCustomerProfileToServer({ id: 12, firstName: "Ali", lastName: "Valiyev" }), { status: 500, profileSaved: true });
  assert.equal((await loadCustomerProfile()).id, 12);
  assert.deepEqual(calls, ["PUT", "GET", "GET"]);
});
