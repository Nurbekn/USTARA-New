import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";

// Same recursive loader used by login.test.js: real modules and mock fetch,
// with public Vite env substituted in memory, without reading .env files.
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
const { resetRequest, resetError, resetDeadlines, validResetToken } = await import(
  await loadModule(new URL("../src/pages/auth/utils/passwordReset.js", import.meta.url)));
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const challengeToken = "a".repeat(64);
const resetToken = "b".repeat(64);
const expiry = new Date(Date.now() + 180000).toISOString();
const sent = { message: "Kod yuborildi", code: "reset_started", challengeToken,
  otpExpiresAt: expiry, challengeExpiresAt: new Date(Date.now() + 1800000).toISOString(), resendAfter: 180 };
const cases = [
  ["start", { phone: "+998901234567" }, sent],
  ["resend", { challengeToken }, { ...sent, code: "reset_resent" }],
  ["verify", { challengeToken, otp: "00123" }, { message: "Yangi parolni kiriting.", code: "reset_verified", resetToken, resetExpiresAt: expiry }],
  ["complete", { resetToken, password: "ResetTest123" }, { message: "Parol yangilandi", code: "reset_completed" }],
];
for (const [action, body, expected] of cases) {
  test(`${action}: POST payload and full success response are preserved`, async () => {
    let calls = 0;
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(url, `http://localhost:5000/api/auth/password-reset/${action}`);
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), body);
      assert.equal(options.credentials, "omit");
      assert.equal(new Headers(options.headers).has("Authorization"), false);
      assert.ok(!url.includes(challengeToken) && !url.includes(resetToken));
      return new Response(JSON.stringify(expected));
    };
    assert.deepEqual(await resetRequest(action, body), expected);
    assert.equal(calls, 1);
    if (action === "start" || action === "resend") {
      const before = Date.now();
      const deadlines = resetDeadlines(expected);
      assert.equal(deadlines.otpExpiresAt, Date.parse(expected.otpExpiresAt));
      assert.equal(deadlines.challengeExpiresAt, Date.parse(expected.challengeExpiresAt));
      assert.ok(deadlines.resendAt >= before + 180000 && deadlines.resendAt <= Date.now() + 180000);
    }
    if (action === "verify") assert.equal(validResetToken(expected.resetToken), true);
  });
}

test("HTTP errors retain backend status, code, message and all metadata", async () => {
  for (const [status, code, metadata, uiMessage] of [
    [400, "invalid_otp", { attemptsRemaining: 3 }, "Kod noto‘g‘ri. 3 ta urinish qoldi."],
    [429, "resend_too_soon", { retryAfter: 120 }, "Kod olish uchun 3 daqiqalik oraliq tugashini kuting."],
    [423, "reset_blocked", { adminRequired: true, blockedUntil: null }, "Parolni tiklash bloklangan. Administratorga murojaat qiling."],
    [400, "invalid_reset_token", { resetExpiresAt: expiry }, "Backend message"],
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "Backend message", code,
      ...metadata, extraInfo: "retained" }), { status });
    await assert.rejects(resetRequest("verify", { challengeToken, otp: "00000" }), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      assert.equal(error.message, "Backend message");
      assert.deepEqual(error.metadata, { ...metadata, extraInfo: "retained" });
      for (const key of ["retryAfter", "adminRequired", "blockedUntil", "attemptsRemaining"]) {
        assert.equal(error[key], metadata[key]);
      }
      assert.equal(resetError(error), uiMessage);
      return true;
    });
  }
});

test("network, non-JSON and empty responses preserve existing UI messages", async () => {
  for (const mode of ["network", "html", "empty"]) {
    globalThis.fetch = async () => {
      if (mode === "network") throw new TypeError("Network unavailable");
      return new Response(mode === "html" ? "<html>private details</html>" : null);
    };
    await assert.rejects(resetRequest("start", { phone: "+998901234567" }), (error) => {
      assert.equal(resetError(error), mode === "network"
        ? "Server bilan aloqa o‘rnatilmadi. Ulanishni tekshirib qayta urinib ko‘ring."
        : "Serverdan javob olinmadi. Qayta urinib ko‘ring.");
      if (mode !== "empty") assert.equal(error.code, mode === "network" ? "network_error" : "invalid_response");
      return true;
    });
  }
});
