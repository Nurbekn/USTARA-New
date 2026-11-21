const { test } = require("node:test");
const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createRegistrationService } = require("../services/registrationService");
const { createTestSmsAdapter } = require("../services/registrationSms");
const { createRegistrationController } = require("../controllers/registrationController");
const { normalizePhone, names, OTP_PATTERN, createOtpCrypto, sessionHash } = require("../utils/registration");
const passwords = require("../utils/passwordPolicy");
const { createMemoryPool } = require("./helpers/registrationPool");

const MINUTE = 60000;
const phone = "+998901234567";
function fixture(options = {}) {
  const { env: overrides, ...dependencies } = options;
  const pool = createMemoryPool();
  const env = { NODE_ENV: "test", OTP_SMS_ADAPTER: "test", OTP_EXPOSE_CODE: "true",
    OTP_HMAC_KEY: "unit-test-only-hmac-key-32-bytes-long", JWT_SECRET: "unit-test-only-jwt-secret", ...overrides };
  const service = createRegistrationService({ pool, env, ...dependencies });
  const start = (extra) => service.start({ phone, role: "customer", password: "Aa123456", ...(extra?.role === "barber" ? { specialty: "stylist" } : {}), ...extra });
  return { pool, env, service, start };
}

test("phone/name validation and cryptographic binding", () => {
  for (const raw of ["90 123-45-67", "998901234567", "+998 (90) 123-45-67", "00998901234567"]) {
    assert.equal(normalizePhone(raw), phone);
  }
  for (const raw of [null, {}, "++998901234567", "abc901234567", "+012345678", "123"]) assert.throws(() => normalizePhone(raw));
  assert.deepEqual(names(" Ali ", "Valiyev"), { first: "Ali", last: "Valiyev" });
  assert.deepEqual(names("a".repeat(80), "b".repeat(80)), { first: "a".repeat(80), last: "b".repeat(80) });
  assert.throws(() => names("a".repeat(81), "Vali"));
  assert.throws(() => names("Ali", "b".repeat(81)));
  for (const raw of ["", "<script>", "Ali\nVali", "Ali\0"]) assert.throws(() => names(raw, "Vali"));
  const crypto = createOtpCrypto({ OTP_HMAC_KEY: "test-only-strong-key-32-bytes-long" });
  const issuance = crypto.issue(phone, "1");
  assert.equal(typeof issuance.code, "string");
  assert.match(issuance.code, OTP_PATTERN);
  const row = { phone, id: "1", otp_issuance_nonce: issuance.nonce, otp_hmac_hash: issuance.hash, otp_hmac_key_id: issuance.keyId };
  assert.equal(crypto.matches(row, issuance.code), true);
  for (const changed of [{ id: "2" }, { phone: "+998901234568" }, { otp_issuance_nonce: "a".repeat(64) }]) {
    assert.equal(crypto.matches({ ...row, ...changed }, issuance.code), false);
  }
  assert.notEqual(sessionHash(crypto.token()), crypto.token());
  assert.throws(() => createOtpCrypto({}).ready(), { code: "otp_unavailable" });
});

test("registration password policy enforces boundaries, composition and common-password rejection", () => {
  const valid128 = `Abcdefg${"1".repeat(121)}`;
  assert.equal(Array.from(valid128).length, 128);
  for (const password of ["Abcdef12", valid128]) assert.equal(passwords.validateRegistrationPassword(password), null);
  for (const password of ["12345678", "password", "qwerty123", "password123"]) {
    assert.ok(passwords.validateRegistrationPassword(password));
  }
  for (const password of ["Abc1234", `Abcdefg${"1".repeat(122)}`, "987654321", "Password"]) {
    assert.ok(passwords.validateRegistrationPassword(password));
  }
  assert.equal(passwords.validateRegistrationPassword("Abcdef12!"), null, "special characters are optional");
});

test("production fails closed and OTP exposure is test-only", async () => {
  for (const nodeEnv of ["production", undefined]) {
    assert.throws(() => createTestSmsAdapter({ NODE_ENV: nodeEnv, OTP_SMS_ADAPTER: "test", OTP_EXPOSE_CODE: "true" }).ready(), { code: "sms_unavailable" });
  }
  const f = fixture({ env: { NODE_ENV: "development" } });
  const result = await f.start();
  assert.equal(result.status, 201);
  assert.equal("testOtp" in result.body, false);
  const production = fixture({ env: { NODE_ENV: "production" } });
  await assert.rejects(production.start(), { code: "telegram_otp_unavailable" });
  assert.equal(production.pool.calls.length, 0);
});

test("registration 5 xonali OTP boshlang‘ich nollarni saqlaydi va noto‘g‘ri uzunlikni rad etadi", async () => {
  const originalRandomInt = nodeCrypto.randomInt;
  nodeCrypto.randomInt = (minimum, maximum) => {
    assert.equal(minimum, 0);
    assert.equal(maximum, 100_000);
    return 123;
  };
  try {
    const f = fixture();
    const started = await f.start();
    assert.equal(started.status, 201);
    assert.equal(typeof started.body.testOtp, "string");
    assert.equal(started.body.testOtp, "00123");
    assert.match(started.body.testOtp, OTP_PATTERN);

    for (const otp of ["0123", "000123", "0a123"]) {
      const rejected = await f.service.verify({ sessionToken: started.body.sessionToken, otp });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.code, "invalid_otp");
    }
    assert.equal(f.pool.state.pending[0].otp_failed_attempts, 3);
    assert.equal((await f.service.verify({ sessionToken: started.body.sessionToken, otp: "00123" })).status, 200);
  } finally {
    nodeCrypto.randomInt = originalRandomInt;
  }
});

test("start stores hashes only, normalizes phone, checks role/password/account and preserves the delivery cooldown on repeated starts", async () => {
  const f = fixture();
  for (const role of ["admin", "Customer", null]) await assert.rejects(f.start({ role }), { code: "invalid_role" });
  await assert.rejects(f.start({ password: "12345678" }), { code: "invalid_password" });
  for (const specialty of [undefined, null, "", "Barber", "doctor", " stylist ", [], {}]) {
    await assert.rejects(f.start({ role: "barber", specialty }), { code: "invalid_specialty" });
  }
  assert.equal(f.pool.calls.length, 0, "invalid specialty must fail before database access");
  const result = await f.start({ phone: "90 123 45 67", specialty: "stylist" });
  const pending = f.pool.state.pending[0];
  assert.equal(result.status, 201);
  assert.equal(pending.phone, phone);
  assert.equal(pending.specialty, null, "customer specialty is ignored");
  assert.equal(f.pool.state.users.length, 0);
  assert.equal(f.pool.state.customers.length, 0);
  assert.notEqual(pending.password_hash, "Aa123456");
  assert.equal(await passwords.verifyPassword("Aa123456", pending.password_hash), true);
  assert.notEqual(pending.session_token_hash, result.body.sessionToken);
  assert.equal(pending.session_token_hash, sessionHash(result.body.sessionToken));
  assert.equal(new Date(pending.otp_expires_at) - new Date(pending.otp_sent_at), MINUTE);
  assert.equal(f.pool.state.history[0].otp_hmac_hash, pending.otp_hmac_hash);
  assert.equal((await f.start({ password: "Other123" })).status, 429);
  assert.equal(f.pool.state.pending[0].session_token_hash, pending.session_token_hash);
  assert.equal(f.pool.state.limits[0].send_count, 1);
  const existing = fixture();
  existing.pool.state.users.push({ id: 1, phone, role: "barber" });
  assert.equal((await existing.start()).body.code, "phone_exists");
  assert.equal(existing.pool.state.pending.length, 0);
});

test("parallel customer/barber starts share one canonical phone and cannot create two accounts", async () => {
  const f = fixture();
  const results = await Promise.all([
    f.service.start({ phone: "90 123 45 67", role: "customer", password: "Abcdef12" }),
    f.service.start({ phone: "+998 (90) 123-45-67", role: "barber", specialty: "stylist", password: "Abcdef12" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 429]);
  assert.equal(f.pool.state.pending.length, 1);
  assert.equal(f.pool.state.pending[0].phone, phone);
  assert.equal(f.pool.state.pending[0].role, results[0].status === 201 ? "customer" : "barber");
  const started = results.find((result) => result.status === 201);
  assert.equal((await f.service.verify({ sessionToken: started.body.sessionToken, otp: started.body.testOtp })).status, 200);
  assert.equal((await f.service.complete({ sessionToken: started.body.sessionToken, firstName: "Ali", lastName: "Vali" })).status, 201);
  const otherRole = started.body === results[0].body ? "barber" : "customer";
  const duplicate = await f.service.start({ phone, role: otherRole, specialty: otherRole === "barber" ? "stylist" : undefined, password: "Abcdef12" });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, "phone_exists");
  assert.equal(f.pool.state.users.length, 1);
  assert.equal(f.pool.state.customers.length + f.pool.state.barbers.length, 1);
});

test("resend boundary, invalidation, five failures survive resend, permanent block survives restart/time", async () => {
  const f = fixture();
  const first = await f.start();
  const sessionToken = first.body.sessionToken;
  f.pool.advance(MINUTE - 1);
  assert.equal((await f.service.resend({ sessionToken })).status, 429);
  f.pool.advance(1);
  const next = await f.service.resend({ sessionToken });
  assert.equal(next.status, 200);
  assert.equal(f.pool.state.history[0].invalidation_reason, "superseded");
  assert.equal(f.pool.state.history.length, 2);
  assert.notEqual(f.pool.state.history[0].issuance_nonce, f.pool.state.pending[0].otp_issuance_nonce);
  assert.notEqual(next.body.testOtp, first.body.testOtp);
  assert.equal((await f.service.verify({ sessionToken, otp: first.body.testOtp })).status, 400);
  // Tasodifan haqiqiy kodga teng bo‘lib qolmasligi uchun noto‘g‘ri format yuboramiz.
  for (let i = 2; i <= 4; i++) {
    assert.equal((await f.service.verify({ sessionToken, otp: "wrong" })).status, 400);
    assert.equal(f.pool.state.pending[0].otp_failed_attempts, i);
  }
  f.pool.advance(MINUTE);
  assert.equal((await f.service.resend({ sessionToken })).status, 200);
  assert.equal(f.pool.state.pending[0].otp_failed_attempts, 4);
  const last = await f.service.verify({ sessionToken, otp: "wrong" });
  assert.equal(last.status, 423);
  assert.equal(f.pool.state.pending[0].otp_failed_attempts, 5);
  assert.equal(f.pool.state.limits[0].blocked_until, "infinity");
  for (const action of ["verify", "resend", "complete"]) {
    const result = await f.service[action]({ sessionToken, otp: next.body.testOtp, firstName: "Ali", lastName: "Vali" });
    assert.equal(result.status, 423);
  }
  f.pool.advance(365 * 24 * 60 * MINUTE);
  assert.equal((await f.start()).status, 423);
  assert.ok(f.pool.calls.filter((q) => q === "COMMIT").length >= 5);
});

test("three sends, fourth blocks one hour; next violation blocks five hours and penalty persists", async () => {
  const f = fixture();
  const first = await f.start();
  const sessionToken = first.body.sessionToken;
  for (let i = 0; i < 2; i++) {
    f.pool.advance(MINUTE);
    assert.equal((await f.service.resend({ sessionToken })).status, 200);
  }
  // Fourth request blocks even if it arrives before cooldown.
  const blocked = await f.service.resend({ sessionToken });
  assert.equal(blocked.status, 423);
  let limit = f.pool.state.limits[0];
  assert.equal(new Date(limit.blocked_until) - new Date(limit.blocked_at), 60 * MINUTE);
  assert.equal(limit.send_count, 3);
  assert.equal(limit.penalty_level, 1);
  f.pool.advance(60 * MINUTE);
  const restart = await f.start();
  assert.equal(restart.status, 201);
  assert.equal(f.pool.state.limits[0].penalty_level, 1);
  await assert.rejects(f.service.verify({ sessionToken, otp: first.body.testOtp }), { code: "invalid_session" });
  for (let i = 0; i < 2; i++) {
    f.pool.advance(MINUTE);
    assert.equal((await f.service.resend({ sessionToken: restart.body.sessionToken })).status, 200);
  }
  assert.equal((await f.service.resend({ sessionToken: restart.body.sessionToken })).status, 423);
  limit = f.pool.state.limits[0];
  assert.equal(limit.penalty_level, 2);
  assert.equal(new Date(limit.blocked_until) - new Date(limit.blocked_at), 300 * MINUTE);
});

test("expired-session restart rotates credentials without resetting wrong attempts; unknown HMAC key fails closed", async () => {
  const f = fixture();
  const first = await f.start();
  const oldToken = first.body.sessionToken;
  for (let i = 0; i < 4; i++) await f.service.verify({ sessionToken: oldToken, otp: "wrong" });
  f.pool.advance(30 * MINUTE);
  const restarted = await f.start();
  assert.equal(restarted.status, 201);
  assert.equal(f.pool.state.pending[0].otp_failed_attempts, 4);
  assert.equal(f.pool.state.limits[0].send_count, 2);
  assert.notEqual(restarted.body.sessionToken, oldToken);
  await assert.rejects(f.service.verify({ sessionToken: oldToken, otp: first.body.testOtp }), { code: "invalid_session" });
  const sessionToken = restarted.body.sessionToken;
  f.env.OTP_HMAC_KEY_ID = "unavailable-key";
  await assert.rejects(f.service.verify({ sessionToken, otp: restarted.body.testOtp }), { code: "otp_unavailable" });
  assert.equal(f.pool.state.pending[0].otp_failed_attempts, 4);
  f.env.OTP_HMAC_KEY_ID = "v1";
  assert.equal((await f.service.verify({ sessionToken, otp: "wrong" })).status, 423);
  assert.equal(f.pool.state.limits[0].blocked_until, "infinity");
});

test("session token discovered before locking is rechecked under pending lock", async () => {
  const f = fixture();
  const first = await f.start();
  const before = structuredClone(f.pool.state);
  const connect = f.pool.connect;
  f.pool.connect = async () => {
    const client = await connect();
    const query = client.query.bind(client);
    client.query = async (sql, args) => {
      const result = await query(sql, args);
      if (sql.startsWith("SELECT * FROM pending_registrations")) {
        result.rows[0].session_token_hash = "0".repeat(64); // concurrent credential rotation observed under lock
      }
      return result;
    };
    return client;
  };
  await assert.rejects(f.service.verify({ sessionToken: first.body.sessionToken, otp: first.body.testOtp }), { code: "invalid_session" });
  assert.deepEqual(f.pool.state, before);
  assert.equal(f.pool.calls.at(-1), "ROLLBACK");
});

test("verify boundary and expired sessions reject; repeated verify cannot extend completion", async () => {
  const expired = fixture();
  const issued = await expired.start();
  expired.pool.advance(MINUTE);
  assert.equal((await expired.service.verify({ sessionToken: issued.body.sessionToken, otp: issued.body.testOtp })).body.code, "otp_expired");
  assert.equal(expired.pool.state.pending[0].phone_verified_at, null);
  expired.pool.advance(29 * MINUTE);
  await assert.rejects(expired.service.resend({ sessionToken: issued.body.sessionToken }), { code: "invalid_session" });
  const f = fixture();
  const first = await f.start();
  const data = { sessionToken: first.body.sessionToken, otp: first.body.testOtp };
  f.pool.advance(MINUTE - 1);
  assert.equal((await f.service.verify(data)).status, 200);
  const row = f.pool.state.pending[0];
  assert.equal(new Date(row.completion_expires_at) - new Date(row.phone_verified_at), 15 * MINUTE);
  f.pool.advance(MINUTE);
  assert.equal((await f.service.verify(data)).status, 409);
  assert.equal((await f.service.resend(data)).status, 409);
  assert.deepEqual(f.pool.state.pending[0].completion_expires_at, row.completion_expires_at);
});

for (const role of ["customer", "barber"]) test(`complete ${role}: linked account/profile, compatible JWT, history survives, session consumed`, async () => {
  const f = fixture();
  const first = await f.start({ role });
  assert.equal(f.pool.state.pending[0].specialty, role === "barber" ? "stylist" : null);
  const sessionToken = first.body.sessionToken;
  f.pool.advance(MINUTE);
  const resent = await f.service.resend({ sessionToken });
  assert.equal(resent.status, 200);
  assert.equal(f.pool.state.pending[0].specialty, role === "barber" ? "stylist" : null);
  first.body.testOtp = resent.body.testOtp;
  const data = { sessionToken, firstName: "Ali", lastName: "Valiyev", specialty: "barber" };
  assert.equal((await f.service.complete(data)).status, 403);
  assert.equal((await f.service.verify({ sessionToken, otp: first.body.testOtp })).status, 200);
  const result = await f.service.complete(data);
  assert.equal(result.status, 201);
  const user = f.pool.state.users[0];
  const profile = f.pool.state[role === "customer" ? "customers" : "barbers"][0];
  assert.equal(profile.user_id, user.id);
  assert.notEqual(profile.id, user.id);
  assert.equal("name" in profile, false);
  assert.equal("name" in result.body[role], false);
  assert.equal(profile.last_name, "Valiyev");
  assert.equal(profile.first_name, "Ali");
  if (role === "barber") {
    assert.equal(profile.specialty, "stylist");
    assert.equal(result.body.barber.specialty, "stylist");
  } else assert.equal("specialty" in profile, false);
  const decoded = jwt.verify(result.body.token, f.env.JWT_SECRET);
  assert.equal(decoded.id, user.id);
  assert.equal(decoded.profileId, profile.id);
  assert.equal(decoded.role, role);
  assert.equal(decoded.exp - decoded.iat, 7 * 24 * 60 * 60);
  assert.equal(f.pool.state.pending.length, 0);
  assert.equal(f.pool.state.history.length, 2);
  assert.equal(f.pool.state.history[0].invalidation_reason, "superseded");
  assert.equal(f.pool.state.history[1].invalidation_reason, "registration_completed");
  assert.equal("password" in result.body[role], false);
  await assert.rejects(f.service.complete(data), { code: "invalid_session" });
  assert.equal((await f.start()).status, 409);
});

for (const role of ["customer", "barber"]) test(`complete ${role} accepts 80+80 characters and rejects either field above 80`, async () => {
  const f = fixture();
  const first = await f.start({ role, ...(role === "barber" ? { specialty: "barber" } : {}) });
  const { sessionToken, testOtp } = first.body;
  await f.service.verify({ sessionToken, otp: testOtp });
  await assert.rejects(f.service.complete({ sessionToken, firstName: "A".repeat(81), lastName: "Vali" }), { code: "invalid_name" });
  await assert.rejects(f.service.complete({ sessionToken, firstName: "Ali", lastName: "B".repeat(81) }), { code: "invalid_name" });
  const result = await f.service.complete({ sessionToken, firstName: "A".repeat(80), lastName: "B".repeat(80) });
  assert.equal(result.status, 201);
  assert.equal(result.body[role].first_name.length, 80);
  assert.equal(result.body[role].last_name.length, 80);
  assert.equal("name" in result.body[role], false);
});

test("completion uses full verified window even beyond pre-verification session expiry; exact deadline rejects", async () => {
  const f = fixture();
  const first = await f.start();
  const sessionToken = first.body.sessionToken;
  let issue;
  for (let i = 0; i < 2; i++) {
    f.pool.advance(14 * MINUTE);
    issue = await f.service.resend({ sessionToken });
    assert.equal(issue.status, 200);
  }
  f.pool.advance(30 * 1000);
  assert.equal((await f.service.verify({ sessionToken, otp: issue.body.testOtp })).status, 200);
  f.pool.advance(2 * MINUTE);
  const result = await f.service.complete({ sessionToken, firstName: "Ali", lastName: "Vali" });
  assert.equal(result.status, 201);
  const expired = fixture();
  const issued = await expired.start();
  await expired.service.verify({ sessionToken: issued.body.sessionToken, otp: issued.body.testOtp });
  expired.pool.advance(15 * MINUTE);
  assert.equal((await expired.service.complete({ sessionToken: issued.body.sessionToken, firstName: "Ali", lastName: "Vali" })).status, 410);
  assert.equal(expired.pool.state.users.length, 0);
});

test("admin unblock is atomic, checks active admin, revokes old session and preserves prior history reasons", async () => {
  const f = fixture();
  const first = await f.start();
  const sessionToken = first.body.sessionToken;
  f.pool.advance(MINUTE);
  await f.service.resend({ sessionToken });
  const superseded = structuredClone(f.pool.state.history[0]);
  for (let i = 0; i < 5; i++) await f.service.verify({ sessionToken, otp: "bad" });
  const body = { phone, reason: "Support reviewed registration" };
  for (const actor of [null, { role: "customer", id: 1 }, { role: "admin", id: 2 }]) {
    await assert.rejects(f.service.unblock(body, actor), { code: "admin_required" });
  }
  const actor = { role: "admin", id: 1 };
  f.pool.state.adminActive = false;
  await assert.rejects(f.service.unblock(body, actor), { code: "admin_required" });
  f.pool.state.adminActive = true;
  f.pool.fault = "INSERT INTO registration_admin_actions";
  const before = structuredClone(f.pool.state);
  await assert.rejects(f.service.unblock(body, actor), /simulated storage failure/);
  assert.deepEqual(f.pool.state, before);
  assert.equal((await f.service.unblock(body, actor)).status, 200);
  const limit = f.pool.state.limits[0];
  assert.equal(limit.send_count, 0);
  assert.equal(limit.penalty_level, 0);
  assert.equal(limit.last_sent_at, null);
  assert.equal(limit.blocked_until, null);
  assert.equal(f.pool.state.pending.length, 0);
  assert.equal(f.pool.state.history.length, 2);
  assert.deepEqual(f.pool.state.history[0], superseded);
  assert.equal(f.pool.state.actions[0].admin_account_id, 1);
  const security = f.pool.state.events.find((e) => e.event_type === "admin_unblocked");
  assert.deepEqual(f.pool.state.actions[0].occurred_at, security.occurred_at);
  assert.deepEqual(limit.admin_unblocked_at, security.occurred_at);
  await assert.rejects(f.service.verify({ sessionToken, otp: first.body.testOtp }), { code: "invalid_session" });
  const restart = await f.start();
  assert.equal(restart.status, 201);
  assert.notEqual(restart.body.sessionToken, sessionToken);
});

test("admin unblock invalidates live history and does not remove existing users", async () => {
  const f = fixture();
  await f.start();
  f.pool.state.users.push({ id: 99, phone, role: "customer" });
  assert.equal((await f.service.unblock({ phone, reason: "Reviewed" }, { role: "admin", id: 1 })).status, 200);
  assert.equal(f.pool.state.history[0].invalidation_reason, "admin_unblocked");
  assert.equal(f.pool.state.users.length, 1);
  assert.equal((await f.start()).body.code, "phone_exists");
});

test("SMS, profile, signing, audit and commit failures roll back and release the client", async () => {
  const sms = { ready() {}, exposeCode() { return true; }, async send() { throw new Error("simulated delivery failure"); } };
  const brokenSend = fixture({ sms });
  await assert.rejects(brokenSend.start(), /delivery failure/);
  assert.equal(brokenSend.pool.state.pending.length, 0);
  assert.equal(brokenSend.pool.state.history.length, 0);
  assert.equal(brokenSend.pool.state.limits.length, 0);
  assert.equal(brokenSend.pool.released, 1);
  for (const fault of ["INSERT INTO customers(", "INSERT INTO registration_security_events", "COMMIT", "signing"]) {
    const f = fixture(fault === "signing" ? { signToken() { throw new Error("simulated signing failure"); } } : {});
    const first = await f.start();
    const sessionToken = first.body.sessionToken;
    await f.service.verify({ sessionToken, otp: first.body.testOtp });
    const before = structuredClone(f.pool.state);
    if (fault !== "signing") f.pool.fault = fault;
    await assert.rejects(f.service.complete({ sessionToken, firstName: "Ali", lastName: "Vali" }), /simulated/);
    assert.deepEqual(f.pool.state, before);
    assert.equal(f.pool.calls.at(-1), "ROLLBACK");
    assert.equal(f.pool.released, 3);
  }
});

test("parallel double requests are safe under simulated serialization (real PostgreSQL locking not tested)", async () => {
  const f = fixture();
  const starts = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(starts.map((r) => r.status).sort(), [201, 429]);
  const { sessionToken, testOtp } = starts.find((r) => r.status === 201).body;
  f.pool.advance(MINUTE);
  const sends = await Promise.all([f.service.resend({ sessionToken }), f.service.resend({ sessionToken })]);
  assert.deepEqual(sends.map((r) => r.status).sort(), [200, 429]);
  const latest = sends.find((r) => r.status === 200).body.testOtp;
  const verified = await Promise.all([f.service.verify({ sessionToken, otp: latest }), f.service.verify({ sessionToken, otp: latest })]);
  assert.deepEqual(verified.map((r) => r.status).sort(), [200, 409]);
  const data = { sessionToken, firstName: "Ali", lastName: "Vali" };
  const completed = await Promise.allSettled([f.service.complete(data), f.service.complete(data)]);
  assert.equal(completed.filter((r) => r.status === "fulfilled" && r.value.status === 201).length, 1);
  assert.equal(completed.filter((r) => r.status === "rejected" && r.reason.code === "invalid_session").length, 1);
  assert.equal(f.pool.state.users.length, 1);
  assert.equal(f.pool.state.customers.length, 1);
  assert.ok(testOtp);
});

test("HTTP error mapper hides SQL details and adds no-store/retry headers", async () => {
  const { RegistrationError } = require("../utils/registration");
  function res() {
    return { headers: {}, set(k, v) { this.headers[k] = v; return this; },
      status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } };
  }
  for (const error of [new Error("secret SQL row detail"), Object.assign(new Error("secret duplicate"), { code: "23505" }),
    new RegistrationError(401, "Invalid session", "invalid_session")]) {
    const controller = createRegistrationController({ async start() { throw error; } });
    const result = await controller.start({ body: {} }, res());
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.equal(JSON.stringify(result.body).includes("secret"), false);
    assert.equal(result.statusCode, error instanceof RegistrationError ? 401 : error.code === "23505" ? 409 : 500);
  }
  const controller = createRegistrationController({ async resend() { return { status: 429, body: { retryAfter: 180 } }; } });
  const result = await controller.resend({ body: {} }, res());
  assert.equal(result.headers["Retry-After"], "180");
});

test("actual routers: OTP flow, legacy closure, protected unblock, unchanged login/JWT, immutable barber phone", async () => {
  const pool = createMemoryPool();
  const dbPath = require.resolve("../db");
  assert.equal(require.cache[dbPath], undefined, "unit tests must never import the real database module");
  const savedEnv = {};
  const config = { NODE_ENV: "test", OTP_SMS_ADAPTER: "test", OTP_EXPOSE_CODE: "true",
    OTP_HMAC_KEY: "router-test-only-hmac-key-32-bytes", JWT_SECRET: "router-test-only-secret",
    ADMIN_LOGIN: "unit-admin", ADMIN_PASSWORD: "unit-admin-pass" };
  for (const [key, value] of Object.entries(config)) { savedEnv[key] = process.env[key]; process.env[key] = value; }
  const result = (rows) => ({ rows, rowCount: rows.length });
  const barberProfileQueries = [];
  // Replace db BEFORE loading any controller or auth middleware. This prevents
  // db.js/dotenv from executing; unexpected queries fail instead of connecting.
  const db = {
    connect: () => pool.connect(),
    async query(sql, args = []) {
      const q = sql.replace(/\s+/g, " ");
      if (q.startsWith("SELECT version FROM account_session_versions")) return result([]);
      // JWTs created during the OTP flow carry a persisted device session.
      if (q.startsWith('SELECT 1 FROM account_device_sessions')) return result(
        pool.state.deviceSessions.some(row => row.session_id === args[0] && row.user_id === args[1]) ? [{'?column?':1}] : []);
      if (q.startsWith("SELECT id FROM admin_accounts")) return result(pool.state.adminActive && (args[0] || 1) === 1 ? [{ id: 1 }] : []);
      if (q.startsWith("SELECT c.id,c.first_name,c.last_name,c.avatar_url,c.address,c.latitude,c.longitude,u.phone,c.created_at FROM customers c JOIN users u ON u.id=c.user_id WHERE u.id=$1")) {
        const user = pool.state.users.find((row) => row.id === args[0] && row.role === "customer");
        const profile = user && pool.state.customers.find((row) => row.user_id === user.id);
        return result(profile ? [{ ...profile, phone: user.phone }] : []);
      }
      if (q.startsWith("SELECT b.id, b.first_name") && q.includes("u.phone FROM barbers b JOIN users u")) {
        barberProfileQueries.push(q);
        const profile = pool.state.barbers.find((row) => row.id === args[0] && row.user_id === args[1]);
        const user = pool.state.users.find((row) => row.id === args[1] && row.role === "barber");
        return result(profile && user ? [{ id: profile.id, phone: user.phone }] : []);
      }
      if (q.startsWith("SELECT profile.id")) {
        const role = args.at(-1);
        const table = role === "customer" ? "customers" : "barbers";
        const user = pool.state.users.find((row) => row.id === (args.length === 3 ? args[1] : args[0]) && row.role === role);
        const profile = user && pool.state[table].find((row) => row.user_id === user.id && (args.length !== 3 || row.id === args[0]));
        return result(profile ? [{ id: profile.id }] : []);
      }
      if (q.startsWith("SELECT u.id AS user_id")) {
        const role = q.includes("JOIN customers") ? "customer" : "barber";
        const user = pool.state.users.find((row) => row.phone === args[0] && row.role === role);
        const profile = user && pool.state[role === "customer" ? "customers" : "barbers"].find((row) => row.user_id === user.id);
        return result(profile ? [{ ...profile, user_id: user.id, phone: user.phone, role: user.role, password: user.password }] : []);
      }
      if (q.startsWith("UPDATE customers")) {
        assert.match(q, /SET first_name=\$1, last_name=\$2/);
        const profile = pool.state.customers.find((row) => row.id === args[2]);
        if (profile) Object.assign(profile, { first_name: args[0], last_name: args[1] });
        return result(profile ? [profile] : []);
      }
      if (q.startsWith("UPDATE barbers AS b SET")) {
        barberProfileQueries.push(q);
        const profile = pool.state.barbers.find((row) => row.id === args[0] && row.user_id === args[1]);
        if (profile) Object.assign(profile, { first_name: args[2], last_name: args[3] });
        return result(profile ? [profile] : []);
      }
      throw new Error("Unexpected query in router unit test");
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  function call(router, url, body, token, method = "POST") {
    return new Promise((resolve, reject) => {
      const req = { method, url, body, socket: { remoteAddress: "192.0.2.1" }, headers: token ? { authorization: `Bearer ${token}` } : {} };
      const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; },
        status(n) { this.statusCode = n; return this; }, json(value) { resolve({ status: this.statusCode || 200, body: value }); return this; } };
      router.handle(req, res, (error) => error ? reject(error) : resolve({ status: 404 }));
    });
  }
  try {
    const auth = require("../routes/auth");
    const admin = require("../routes/admin");
    const customers = require("../routes/customers");
    const barbers = require("../routes/barbers");
    const invalidToken = await call(customers, "/me", {}, "not-a-jwt", "GET");
    assert.equal(invalidToken.status, 401);
    const expiredToken = jwt.sign({ id: 1, profileId: 101, role: "customer" }, config.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await call(customers, "/me", {}, expiredToken, "GET")).status, 401);
    for (const router of [customers, barbers]) assert.equal((await call(router, "/register", {})).status, 410);
    assert.equal((await call(admin, "/registration/unblock", { phone, reason: "Reviewed" })).status, 401);
    const adminLogin = await call(admin, "/login", { login: config.ADMIN_LOGIN, password: config.ADMIN_PASSWORD });
    assert.equal(adminLogin.status, 200);
    assert.equal(jwt.verify(adminLogin.body.token, config.JWT_SECRET).role, "admin");
    assert.equal((await call(admin, "/login", { login: config.ADMIN_LOGIN, password: "wrong" })).status, 401);
    const start = await call(auth, "/registration/start", { phone, role: "customer", password: "Aa123456" });
    assert.equal(start.status, 201);
    const { sessionToken, testOtp } = start.body;
    assert.equal((await call(auth, "/registration/resend", { sessionToken })).status, 429);
    assert.equal((await call(auth, "/registration/verify", { sessionToken, otp: testOtp })).status, 200);
    const complete = await call(auth, "/registration/complete", { sessionToken, firstName: "Ali", lastName: "Vali" });
    assert.equal(complete.status, 201);
    const token = complete.body.token;
    const ownProfile = await call(customers, "/me", {}, token, "GET");
    assert.equal(ownProfile.status, 200);
    assert.equal(ownProfile.body.customer.id, complete.body.customer.id);
    const claims = jwt.verify(token, config.JWT_SECRET);
    assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
    const otherProfileToken = jwt.sign({ id: claims.id, role: claims.role, sessionVersion: claims.sessionVersion,
      profileId: complete.body.customer.id + 1000 }, config.JWT_SECRET, { expiresIn: "1h" });
    assert.equal((await call(customers, "/me", {}, otherProfileToken, "GET")).status, 401);
    assert.equal((await call(customers, `/${complete.body.customer.id + 1000}`, {}, token, "GET")).status, 403);
    assert.equal((await call(barbers, "/pending", {}, token, "GET")).status, 403);
    assert.equal((await call(admin, "/registration/unblock", { phone, reason: "Reviewed" }, token)).status, 403);
    const login = await call(customers, "/login", { phone, password: "Aa123456" });
    assert.equal(login.status, 200);
    assert.equal(login.body.customer.first_name, "Ali");
    assert.equal(login.body.customer.last_name, "Vali");
    assert.equal("name" in login.body.customer, false);
    assert.equal(jwt.verify(login.body.token, config.JWT_SECRET).profileId, complete.body.customer.id);
    assert.equal((await call(customers, "/login", { phone, password: "wrong" })).status, 401);
    const profileUrl = `/${complete.body.customer.id}`;
    const updated = await call(customers, profileUrl, { first_name: "A".repeat(80), last_name: "B".repeat(80) }, token, "PUT");
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.first_name.length, 80);
    assert.equal("name" in updated.body.data, false);
    assert.equal((await call(customers, profileUrl, { first_name: "A".repeat(81), last_name: "Vali" }, token, "PUT")).status, 400);
    for (const router of [customers, barbers]) assert.equal((await call(router, "/", {}, adminLogin.body.token)).status, 410);
    assert.equal((await call(admin, "/registration/unblock", { phone, reason: "Reviewed" }, adminLogin.body.token)).status, 200);
    pool.state.adminActive = false;
    assert.equal((await call(admin, "/registration/unblock", { phone, reason: "Reviewed" }, adminLogin.body.token)).status, 401);
    pool.state.adminActive = true;

    const barberStart = await call(auth, "/registration/start", { phone: "+998901234568", role: "barber", password: "Aa123456", specialty: "cosmetolog" });
    const barberSession = barberStart.body.sessionToken;
    await call(auth, "/registration/verify", { sessionToken: barberSession, otp: barberStart.body.testOtp });
    const barberComplete = await call(auth, "/registration/complete", { sessionToken: barberSession, firstName: "Vali", lastName: "Ali" });
    assert.equal(barberComplete.body.barber.specialty, "cosmetolog");
    const barberLogin = await call(barbers, "/login", { phone: "+998901234568", password: "Aa123456" });
    assert.equal(barberLogin.status, 200);
    const barberClaims = jwt.verify(barberLogin.body.token, config.JWT_SECRET);
    assert.equal(barberClaims.profileId, barberComplete.body.barber.id);
    const url = `/${barberComplete.body.barber.id}`;
    assert.equal((await call(barbers, url, { first_name: "Vali", last_name: "Ali", phone: "+998901234569" }, barberLogin.body.token, "PUT")).status, 403);
    assert.equal(barberProfileQueries.some((sql) => sql.startsWith("UPDATE barbers")), false);
    assert.equal((await call(barbers, url, { first_name: "Vali", last_name: "Ali", phone: "+998901234568" }, barberLogin.body.token, "PUT")).status, 200);
    assert.equal(barberProfileQueries.some((sql) => sql.includes("UPDATE users")), false);
  } finally {
    delete require.cache[dbPath];
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
