const { test } = require("node:test");
const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createPasswordResetService } = require("../services/passwordResetService");
const { createPasswordResetController } = require("../controllers/passwordResetController");
const { OTP_PATTERN, createOtpCrypto, sessionHash } = require("../utils/registration");
const passwordPolicy = require("../utils/passwordPolicy");
const { createPasswordResetPool } = require("./helpers/passwordResetPool");
const phone = "+998901234567", M = 60000;
function fixture(options = {}) {
  const pool = createPasswordResetPool(), issued = [], deliveries = [];
  const env = { NODE_ENV: "test", OTP_SMS_ADAPTER: "test", OTP_HMAC_KEY: "password-reset-unit-only-32-byte-secret" };
  const base = createOtpCrypto(env);
  const otpCrypto = { ...base, issue(...args) { const issue = base.issue(...args); issued.push(issue); return issue; } };
  const sms = { ready() {}, async send(message) { deliveries.push(message); }, exposeCode: () => true };
  const service = createPasswordResetService({ pool, env, otpCrypto, sms,
    passwordPolicy: { ...passwordPolicy, hashPassword: async (password) => "unit-hash:" + password }, ...options });
  const start = (value = phone) => service.start({ phone: value });
  return { pool, service, start, issued, deliveries, base };
}
const wrong = (f) => f.issued.at(-1).code === "000000" ? "000001" : "000000";
async function verified(f, value = phone) {
  const started = await f.start(value), challengeToken = started.body.challengeToken;
  const result = await f.service.verify({ challengeToken, otp: f.issued.at(-1).code });
  return { ...result.body, challengeToken };
}

test("known/unknown start have identical shape; only real accounts receive SMS; no OTP/token plaintext stored", async () => {
  const f = fixture(), real = await f.start("90 123 45 67"), unknown = await f.start("+998901234569");
  assert.deepEqual(Object.keys(real.body).sort(), Object.keys(unknown.body).sort());
  assert.equal(real.body.message, unknown.body.message); assert.equal(real.status, unknown.status);
  assert.equal(f.deliveries.length, 1); assert.equal("testOtp" in real.body, false);
  assert.match(f.deliveries[0].code, OTP_PATTERN);
  const pending = f.pool.state.requests[0];
  assert.equal(pending.challenge_token_hash, sessionHash(real.body.challengeToken));
  assert.notEqual(pending.otp_hmac_hash, f.issued[0].code);
  assert.equal(f.base.matches({ ...pending, id: `password-reset:${pending.id}` }, f.issued[0].code), true);
  assert.equal(f.base.matches(pending, f.issued[0].code), false, "registration-domain OTP cannot match");
  assert.equal(+new Date(pending.otp_expires_at) - +new Date(pending.otp_sent_at), 3 * M);
  const rejected = await f.service.verify({ challengeToken: unknown.body.challengeToken, otp: f.issued[1].code });
  assert.equal(rejected.body.code, "invalid_otp", "unknown account must never gain reset capability");
});

test("password reset 5 xonali OTP boshlang‘ich nollarni saqlaydi va boshqa formatni rad etadi", async () => {
  const originalRandomInt = nodeCrypto.randomInt;
  nodeCrypto.randomInt = (minimum, maximum) => {
    assert.equal(minimum, 0);
    assert.equal(maximum, 100_000);
    return 123;
  };
  try {
    const f = fixture();
    const started = await f.start();
    const challengeToken = started.body.challengeToken;
    assert.equal(typeof f.issued[0].code, "string");
    assert.equal(f.issued[0].code, "00123");
    assert.match(f.issued[0].code, OTP_PATTERN);
    assert.equal(f.deliveries[0].code, "00123");
    assert.equal("testOtp" in started.body, false);

    for (const otp of ["0123", "000123", "0a123"]) {
      assert.equal((await f.service.verify({ challengeToken, otp })).body.code, 'invalid_otp');
    }
    assert.equal(f.pool.state.requests[0].otp_failed_attempts, 3);
    assert.equal((await f.service.verify({ challengeToken, otp: "00123" })).status, 200);
  } finally {
    nodeCrypto.randomInt = originalRandomInt;
  }
});

test("resend cooldown, expiry boundary, nonce invalidation and attempts survive resend/restart", async () => {
  const f = fixture(), first = await f.start(), challengeToken = first.body.challengeToken;
  await f.service.verify({ challengeToken, otp: wrong(f) });
  assert.equal((await f.service.resend({ challengeToken })).status, 429);
  f.pool.advance(3 * M);
  assert.equal((await f.service.verify({ challengeToken, otp: f.issued[0].code })).body.code, "otp_expired");
  assert.equal((await f.service.resend({ challengeToken })).status, 200);
  assert.equal(f.pool.state.requests[0].otp_failed_attempts, 1);
  assert.equal(f.base.matches({ ...f.pool.state.requests[0], id: `password-reset:${f.pool.state.requests[0].id}`, otp_issuance_nonce: f.issued[0].nonce }, f.issued[0].code), false);
  f.pool.advance(3 * M);
  const restarted = await f.start(); assert.equal(restarted.status, 200);
  assert.equal(f.pool.state.requests[0].otp_failed_attempts, 1);
  await assert.rejects(f.service.verify({ challengeToken, otp: f.issued[0].code }), { code: "invalid_reset_session" });
});

test("five wrong OTPs commit permanent block; only active-admin unblock revokes state atomically", async () => {
  const f = fixture(), started = await f.start(), challengeToken = started.body.challengeToken;
  for (let n = 1; n <= 5; n++) {
    const result = await f.service.verify({ challengeToken, otp: wrong(f) });
    assert.equal(result.status, n === 5 ? 423 : 400);
    if (n < 5) assert.equal(f.pool.state.requests[0].otp_failed_attempts, n);
  }
  assert.equal(f.pool.state.requests.length, 0); f.pool.advance(7 * 24 * 60 * M);
  assert.equal((await f.start()).body.adminRequired, true);
  await assert.rejects(f.service.unblock({ phone, reason: "Reviewed" }, { role: "customer", id: 7 }), { code: "admin_required" });
  f.pool.fault = "INSERT INTO password_reset_events";
  await assert.rejects(f.service.unblock({ phone, reason: "Reviewed" }, { role: "admin", id: 1 }));
  assert.equal(f.pool.state.limits[0].blocked_until, "infinity");
  f.pool.state.adminActive = false;
  await assert.rejects(f.service.unblock({ phone, reason: "Reviewed" }, { role: "admin", id: 1 }), { code: "admin_required" });
  f.pool.state.adminActive = true;
  assert.equal((await f.service.unblock({ phone, reason: "Reviewed" }, { role: "admin", id: 1 })).status, 200);
  assert.equal(f.pool.state.limits[0].blocked_until, null); assert.equal(f.pool.state.events.at(-1).admin_account_id, 1);
});

test("three sends; fourth blocks 1h; repeat blocks 5h, including unknown phones", async () => {
  const f = fixture(); const target = "+998901234569";
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < 3; i++) { assert.equal((await f.start(target)).status, 200); f.pool.advance(3 * M); }
    const result = await f.start(target); assert.equal(result.status, 423);
    assert.equal(result.body.adminRequired, false);
    f.pool.advance((cycle === 0 ? 60 : 300) * M);
  }
  assert.equal(f.deliveries.length, 0);
});

for (const target of [phone, "+998901234568"]) test(`complete ${target.endsWith("7") ? "customer" : "barber"}: real hash, one-use token, JWT version increments`, async () => {
  const f = fixture({ passwordPolicy }), proof = await verified(f, target);
  const row = f.pool.state.requests[0];
  assert.equal(row.challenge_token_hash, null); assert.equal(row.reset_token_hash, sessionHash(proof.resetToken));
  assert.equal(+new Date(row.reset_expires_at) - +new Date(row.verified_at), 5 * M);
  await assert.rejects(f.service.verify({ challengeToken: proof.challengeToken, otp: f.issued[0].code }), { code: "invalid_reset_session" });
  for (const password of ["12345678", "password", "qwerty123", "Abcdefgh", "A1", "A1" + "x".repeat(127)]) {
    await assert.rejects(f.service.complete({ resetToken: proof.resetToken, password }), { code: "invalid_password" });
  }
  const password = "A1" + "x".repeat(126);
  assert.equal((await f.service.complete({ resetToken: proof.resetToken, password })).status, 200);
  const user = f.pool.state.users.find((u) => u.phone === target);
  assert.equal(await passwordPolicy.verifyPassword(password, user.password), true);
  assert.equal(await passwordPolicy.verifyPassword("WrongPass123", user.password), false);
  assert.equal(f.pool.state.versions[0].version, 1); assert.equal(f.pool.state.requests.length, 0);
  await assert.rejects(f.service.complete({ resetToken: proof.resetToken, password }), { code: "invalid_reset_session" });
});

test("expiry and concurrent complete: single winner under mock serialization, no partial writes on audit/commit faults", async () => {
  const expired = fixture(), proof = await verified(expired); expired.pool.advance(5 * M);
  await assert.rejects(expired.service.complete({ resetToken: proof.resetToken, password: "NewPassword123" }), { code: "invalid_reset_session" });
  assert.equal(expired.pool.state.users[0].password, "old-hash");
  const parallel = fixture(), token = (await verified(parallel)).resetToken;
  const results = await Promise.allSettled([1, 2].map(() => parallel.service.complete({ resetToken: token, password: "NewPassword123" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(parallel.pool.state.versions[0].version, 1);
  for (const fault of ["INSERT INTO password_reset_events", "COMMIT"]) {
    const f = fixture(), resetToken = (await verified(f)).resetToken;
    f.pool.fault = fault;
    await assert.rejects(f.service.complete({ resetToken, password: "NewPassword123" }));
    assert.equal(f.pool.state.users[0].password, "old-hash"); assert.equal(f.pool.state.versions.length, 0);
    assert.equal(f.pool.state.requests.length, 1);
  }
});

test("SMS failure remains generic, default production adapter fails closed; controller never exposes internals", async () => {
  const f = fixture({ sms: { ready() {}, async send() { throw Error("private provider failure"); } } });
  assert.equal((await f.start()).status, 200); assert.equal(f.pool.state.events.at(-1).event_type, "sms_delivery_failed");
  const production = createPasswordResetService({ pool: f.pool, env: { NODE_ENV: "production" }, otpCrypto: f.base });
  await assert.rejects(production.start({ phone }), { code: "telegram_otp_unavailable" });
  const controller = createPasswordResetController({ async start() { throw Error("secret-token-and-password"); } });
  const res = { headers: {}, set(k,v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(body) { this.body = body; return this; } };
  await controller.start({ body: {} }, res); assert.equal(res.statusCode, 503);
  assert.equal(res.headers["Cache-Control"], "no-store"); assert.equal(JSON.stringify(res.body).includes("secret"), false);
});

test('yuborilmagan to‘g‘ri OTP tiklash tokenini bermaydi; generic javob saqlanadi', async () => {
  const f = fixture({ sms: { ready() {}, async send() { throw Error('provider timeout'); } } });
  const known = await f.start(), unknown = await f.start('+998901234569');
  assert.equal(known.body.message, unknown.body.message);
  assert.equal(known.status, unknown.status);
  assert.equal(f.pool.state.requests[0].delivered_at, undefined);
  const result = await f.service.verify({ challengeToken: known.body.challengeToken, otp: f.issued[0].code });
  assert.equal(result.body.code, 'invalid_otp');
  assert.equal(result.body.resetToken, undefined);
});

test('valid reset sessiyasidagi beshta noto‘g‘ri format ham doimiy blokka olib keladi', async () => {
  const f = fixture(), challengeToken = (await f.start()).body.challengeToken;
  for (let n = 1; n <= 5; n++) {
    const result = await f.service.verify({ challengeToken, otp: n % 2 ? 123456 : 'abc' });
    assert.equal(result.status, n === 5 ? 423 : 400);
  }
  assert.equal((await f.start()).body.adminRequired, true);
});

test("authentication middleware rejects old JWTs after reset; accepts versioned new login and unaffected accounts/admin", async () => {
  const dbPath = require.resolve("../db"), oldDb = require.cache[dbPath], oldSecret = process.env.JWT_SECRET;
  assert.equal(oldDb, undefined, "test must not load db.js or dotenv");
  const f = fixture(); process.env.JWT_SECRET = "password-reset-middleware-unit-only";
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: f.pool };
  try {
    const middleware = require("../middleware/authMiddleware");
    async function authorize(payload) {
      const req = { headers: { authorization: "Bearer " + jwt.sign(payload, process.env.JWT_SECRET) } };
      const res = { status(v) { this.statusCode = v; return this; }, json() { return this; } }; let accepted = false;
      await middleware(req, res, () => { accepted = true; }); return accepted;
    }
    const identity = { id: 7, profileId: 70, role: "customer" };
    assert.equal(await authorize(identity), true);
    const resetToken = (await verified(f)).resetToken;
    await f.service.complete({ resetToken, password: "NewPassword123" });
    assert.equal(await authorize(identity), false);
    assert.equal(await authorize({ ...identity, sessionVersion: 0 }), false);
    assert.equal(await authorize({ ...identity, sessionVersion: 1 }), true);
    assert.equal(await authorize({ id: 8, profileId: 80, role: "barber" }), true);
    assert.equal(await authorize({ id: 1, role: "admin" }), true);
  } finally {
    delete require.cache[dbPath]; delete require.cache[require.resolve("../middleware/authMiddleware")];
    delete require.cache[require.resolve("../middleware/accountIdentity")];
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});
