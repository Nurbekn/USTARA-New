import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Use the real login, transport and registrationSession modules with mock fetch.
// Substitute only Vite's public env syntax; never load .env or call a server.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const publicEnv = (source) => source.replaceAll("import.meta.env", '{"DEV":true}');
async function loadModule(url) {
  let source = publicEnv(await readFile(url, "utf8"));
  for (const match of source.matchAll(/from "([^"]+)"/g)) {
    const path = match[1].endsWith(".js") ? match[1] : `${match[1]}.js`;
    const dependency = await loadModule(new URL(path, url));
    source = source.replace(`from "${match[1]}"`, `from "${dependency}"`);
  }
  return moduleUrl(source);
}
const { login } = await import(await loadModule(new URL("../src/pages/auth/utils/login.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const phone = "+998901234567";
const password = "LoginTest123";
const invalidMessage = "Telefon raqami yoki parol noto‘g‘ri. Qayta tekshiring.";
function success(role) {
  const claims = { id: 91, profileId: 23, role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
  return { token, [role]: { id: 23, phone, first_name: "Ali", last_name: "Valiyev" },
    ...(role === "barber" ? { verification_status: "approved" } : {}) };
}
function transport(replies) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const reply = replies[calls.length - 1];
    assert.ok(reply, "Unexpected extra request");
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return calls;
}

test("customer login succeeds without calling barber endpoint", async () => {
  const body = success("customer");
  const calls = transport([{ status: 200, body }]);
  const result = await login(phone, password);
  assert.deepEqual(result.profile, body.customer);
  assert.equal(result.session.role, "customer");
  assert.equal(result.session.token, body.token);
  assert.equal(result.session.accountId, 91);
  assert.equal(result.session.profileId, 23);
  assert.deepEqual(calls.map((call) => call.url), ["http://localhost:5000/api/auth/login"]);
});

test("barber login succeeds with one request", async () => {
  const body = success("barber");
  const calls = transport([{ status: 200, body }]);
  const result = await login(phone, password);
  assert.deepEqual(result.profile, body.barber);
  assert.equal(result.session.role, "barber");
  assert.equal(result.session.setupDone, true);
  assert.equal(result.session.verification_status, "approved");
  assert.equal(result.session.token, body.token);
  assert.deepEqual(calls.map((call) => call.url), ["http://localhost:5000/api/auth/login"]);
});

test("one 401 response retains UI message without a second request", async () => {
  const calls = transport([{ status: 401, body: { message: "Login denied", code: "invalid_credentials" } }]);
  await assert.rejects(login(phone, password), (error) => {
    assert.equal(error.message, invalidMessage);
    assert.equal(error.status, 401);
    assert.equal(error.code, "invalid_credentials");
    assert.equal(error.backendMessage, "Login denied");
    assert.equal(error.cause.message, "Login denied");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("login requests send phone/password JSON without Authorization", async () => {
  const calls = transport([{ status: 200, body: success("barber") }]);
  await login(phone, password);
  for (const { options } of calls) {
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { phone, password });
    assert.equal(new Headers(options.headers).has("Authorization"), false);
    assert.equal(options.credentials, "omit");
  }
});

test("login canonicalizes a formatted national phone number", async () => {
  const calls = transport([{ status: 200, body: success("customer") }]);
  await login("90 123-45-67", password);
  assert.equal(JSON.parse(calls[0].options.body).phone, phone);
});

test("login does not apply the registration password length limit to existing credentials", async () => {
  const longPassword = `Legacy${"x".repeat(180)}7`;
  const calls = transport([{ status: 200, body: success("customer") }]);
  await login(phone, longPassword);
  assert.equal(JSON.parse(calls[0].options.body).password, longPassword);
});

test("non-401 failures never try barber and preserve API details with UI messages", async () => {
  for (const [status, message] of [[403, "Hisobga kirish cheklangan. Administratorga murojaat qiling."],
    [423, "Hisobga kirish cheklangan. Administratorga murojaat qiling."],
    [429, "Urinishlar ko‘payib ketdi. 180 soniyadan keyin qayta urinib ko‘ring."],
    [500, "Kirish xizmati hozir ishlamayapti. Keyinroq qayta urinib ko‘ring."]]) {
    const calls = transport([{ status, body: { message: "Backend message", code: "backend_code", retryAfter: 180 } }]);
    await assert.rejects(login(phone, password), (error) => {
      assert.equal(error.message, message);
      assert.equal(error.status, status);
      assert.equal(error.code, "backend_code");
      assert.equal(error.backendMessage, "Backend message");
      assert.deepEqual(error.metadata, { retryAfter: 180 });
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test("network and invalid JSON failures preserve existing login messages without fallback", async () => {
  for (const invalidJson of [false, true]) {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (invalidJson) return new Response("<html>Error</html>");
      throw new TypeError("Network unavailable");
    };
    await assert.rejects(login(phone, password), (error) => {
      assert.equal(error.message, invalidJson ? "Serverdan kirish ma’lumotlari olinmadi."
        : "Server bilan aloqa o‘rnatilmadi. Ulanishni tekshirib, qayta urinib ko‘ring.");
      assert.equal(error.code, invalidJson ? "invalid_response" : "network_error");
      return true;
    });
    assert.equal(calls, 1);
  }
});
