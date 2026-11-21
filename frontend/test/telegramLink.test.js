import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Reuse the recursive data-URL loader pattern. Exercise the real request helper,
// session reader and API adapter; do not render React/JSX or contact Telegram.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const publicEnv = (source) => source.replaceAll("import.meta.env", '{"DEV":true}');
async function loadModule(url) {
  let source = publicEnv(await readFile(url, "utf8"));
  if (url.pathname.endsWith("TelegramLinkCard.jsx")) {
    assert.ok(source.includes("export default function TelegramLinkCard()"));
    source = source.split("export default function TelegramLinkCard()")[0]
      .replace(/^import .* from "react";\n/m, "")
      // v145 uses router/locale only in the JSX component; request() is unchanged.
      .replace(/^import .* from "react-router-dom";\n/m, "")
      .replace(/^import .* from "\.\.\/\.\.\/\.\.\/utils\/siteLocale\.js";\n/m, "")
      .replace(/^import .* from "\.\.\/\.\.\/\.\.\/components\/accountLocaleV145\.js";\n/m, "") + "\nexport { request };";
  }
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const path = match[1].endsWith(".js") ? match[1] : `${match[1]}.js`;
    const dependency = await loadModule(new URL(path, url));
    source = source.replace(`from "${match[1]}"`, `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const { request } = await import(await loadModule(new URL("../src/pages/barber/components/TelegramLinkCard.jsx", import.meta.url)));
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
} });
function session(role = "barber", version = 1) {
  const claims = { id: 91, profileId: 23, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.version${version}`;
  storage.set("ustara-api-access-token", token);
  storage.set("ustara-session", JSON.stringify({ role, phone: "+998901234567", accountId: 91,
    profileId: 23, authSource: "backend", authenticated: true, tokenExpiresAt: claims.exp * 1000 }));
  return token;
}
beforeEach(() => { storage.clear(); session(); });
afterEach(() => { globalThis.fetch = originalFetch; storage.clear(); });
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});

for (const [action, method, suffix, expected] of [
  ["start", "POST", "/start", { token: "a".repeat(64), expiresAt: "2030-01-01T00:05:00Z", botUrl: "https://t.me/ustara_test_bot" }],
  ["status", "GET", "/status", { linked: true, botUrl: "https://t.me/ustara_test_bot" }],
  ["unlink", "DELETE", "", { linked: false }],
]) {
  test(`${action} succeeds with current Bearer JWT and unchanged endpoint/method`, async () => {
    const token = storage.get("ustara-api-access-token");
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, `http://localhost:5000/api/barbers/telegram${suffix}`);
      assert.equal(options.method, method);
      assert.equal(new Headers(options.headers).get("Authorization"), `Bearer ${token}`);
      assert.equal(options.body, undefined);
      assert.ok(!url.includes(token));
      assert.equal(options.credentials, "omit");
      return new Response(JSON.stringify(expected));
    };
    assert.deepEqual(await request(action, new AbortController().signal), expected);
    assert.equal(calls, 1);
  });
}

test("JWT is read from the current session for each request", async () => {
  const tokens = [];
  globalThis.fetch = async (_url, options) => {
    tokens.push(new Headers(options.headers).get("Authorization"));
    return new Response('{"linked":false}');
  };
  const first = session("barber", 1);
  await request("status");
  const second = session("barber", 2);
  await request("status");
  assert.deepEqual(tokens, [`Bearer ${first}`, `Bearer ${second}`]);
});

test("401 preserves re-login UI message, backend details and existing session", async () => {
  const original = new Map(storage);
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Session revoked", code: "unauthorized", reason: "session_version" }), { status: 401 });
  for (const action of ["start", "status", "unlink"]) {
    await assert.rejects(request(action), (error) => {
      assert.equal(error.message, "Qayta tizimga kiring.");
      assert.equal(error.status, 401);
      assert.equal(error.code, "unauthorized");
      assert.equal(error.backendMessage, "Session revoked");
      assert.deepEqual(error.metadata, { reason: "session_version" });
      return true;
    });
  }
  assert.deepEqual(storage, original);
});

test("backend errors preserve status, code, message and metadata", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Backend message", code: "link_conflict",
    retryAfter: 60, expiresAt: "2030-01-01T00:05:00Z", reason: "already_linked" }), { status: 409 });
  await assert.rejects(request("start"), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "link_conflict");
    assert.equal(error.message, "Backend message");
    assert.deepEqual(error.metadata, { retryAfter: 60, expiresAt: "2030-01-01T00:05:00Z", reason: "already_linked" });
    return true;
  });
});

test("missing token or customer session is rejected before fetch", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected fetch"); };
  storage.delete("ustara-api-access-token");
  await assert.rejects(request("start"), { message: "Qayta tizimga kiring." });
  session("customer");
  await assert.rejects(request("start"), { message: "Qayta tizimga kiring." });
  assert.equal(calls, 0);
});

test("network, non-JSON and empty responses preserve existing UI messages", async () => {
  for (const mode of ["network", "html", "empty"]) {
    globalThis.fetch = async () => {
      if (mode === "network") throw new TypeError("Network unavailable");
      return new Response(mode === "html" ? "<html>Internal details</html>" : null);
    };
    await assert.rejects(request("start"), (error) => {
      assert.equal(error.message, mode === "network" ? "Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring." : "Serverdan javob olinmadi.");
      return true;
    });
  }
});
