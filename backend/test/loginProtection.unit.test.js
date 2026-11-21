const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createLoginProtection, clientIp, sendLogin } = require("../services/loginProtection");
const { createRoleLogin, createAdminLogin } = require("../services/loginAuthentication");
const { hashPassword } = require("../utils/passwordPolicy");
const M = 60000;
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");

// Transactional memory double, not PostgreSQL. SQL order and rollback are
// asserted here; actual PostgreSQL locking/DDL still require an isolated test.
function fixture() {
  let state = new Map(), time = new Date("2026-11-14T00:00:00Z"), queue = Promise.resolve();
  let user = null, active = true, failCommit = false;
  const calls = [];
  const pool = { async connect() {
    let local, unlock;
    return { async query(sql, args = []) {
      const q = sql.replace(/\s+/g, " ").trim(); calls.push(q);
      if (q === "BEGIN") {
        const prior = queue; queue = new Promise((r) => { unlock = r; }); await prior;
        local = structuredClone(state); return { rows: [] };
      }
      if (q === "ROLLBACK") { unlock(); return { rows: [] }; }
      if (q === "COMMIT") {
        if (failCommit) throw new Error("injected commit failure");
        state = local; unlock(); return { rows: [] };
      }
      if (q.startsWith("SET LOCAL")) return { rows: [] };
      if (q === "SELECT clock_timestamp() AS time") return { rows: [{ time }] };
      const key = args.slice(0, 3).join(":");
      if (q.startsWith("INSERT INTO login_attempt_limits")) {
        if (!local.has(key)) local.set(key, { scope: args[0], kind: args[1], key_hash: args[2], failed_count: 0,
          penalty_level: 0, window_started_at: null, last_failed_at: null, blocked_until: null });
        return { rows: [] };
      }
      if (q.startsWith("SELECT * FROM login_attempt_limits")) return { rows: [local.get(key)] };
      if (q.startsWith("UPDATE login_attempt_limits")) {
        Object.assign(local.get(key), args.length === 3
          ? { failed_count: 0, penalty_level: 0, window_started_at: null, last_failed_at: null, blocked_until: null }
          : { failed_count: args[3], penalty_level: args[4], window_started_at: args[5], last_failed_at: args[6], blocked_until: args[7] });
        return { rows: [] };
      }
      // v7 introduced persisted device sessions on every successful login.
      if (q.startsWith('INSERT INTO account_device_sessions(')) {
        assert.match(args[0], /^[0-9a-f]{32}$/);
        local.set(`device:${args[0]}`, {userId:args[1],label:args[2]});
        return {rows:[],rowCount:1};
      }
      if (q.startsWith("SELECT u.id AS user_id")) {
        if (!user || user.phone !== args[0]) return { rows: [], rowCount: 0 };
        const matchesRole = q.includes(`JOIN ${user.role === "customer" ? "customers" : "barbers"} `);
        return { rows: [{ ...user, id: matchesRole ? user.id : null }], rowCount: 1 };
      }
      if (q.startsWith("UPDATE users SET deactivated_at=NULL")) {
        if (!user?.deactivated_at || user.user_id !== args[0] || user.role !== args[1]) return {rows:[],rowCount:0};
        user.deactivated_at=null; return { rows:[{id:user.user_id}],rowCount:1 };
      }
      if (q.startsWith("INSERT INTO account_session_versions")) {
        user.session_version=(user.session_version??0)+1;
        return { rows:[{version:user.session_version}],rowCount:1 };
      }
      if (q.startsWith("SELECT id FROM admin_accounts")) return { rows: active ? [{ id: 1 }] : [], rowCount: active ? 1 : 0 };
      throw new Error("Unexpected mock SQL");
    }, release() {} };
  } };
  const protect = createLoginProtection(pool);
  return { pool, protect, calls, get state() { return state; }, advance: (ms) => { time = new Date(+time + ms); },
    user: (v) => { user = v; }, adminActive: (v) => { active = v; }, failCommit: () => { failCommit = true; },
    row: (kind, key, scope = "public", account = "+998901234567") => state.get([scope, kind, hash(kind === "ip" && scope === "public" ? JSON.stringify([account, key]) : key)].join(":")) };
}
const failure = async () => ({ status: 401, body: { message: "invalid" }, outcome: "failure" });
const success = async () => ({ status: 200, body: {}, outcome: "success" });
const identity = (account = "+998901234567", ip = "192.0.2.1", scope = "public") => ({ account, ip, scope });

test("five failures block 1/3/5 minutes; blocked retries do not extend; expiry is automatic", async () => {
  const f = fixture();
  for (const [i, minutes] of [1, 3, 5, 5].entries()) {
    const key = identity(undefined, `192.0.2.${i + 1}`);
    for (let n = 0; n < 4; n++) assert.equal((await f.protect(key, failure)).status, 401);
    const result = await f.protect(key, failure);
    assert.equal(result.status, 429); assert.equal(result.body.retryAfter, minutes * 60);
    const until = f.row("account", key.account).blocked_until;
    const retry = await f.protect(key, () => { throw Error("blocked login must not check password"); });
    assert.equal(retry.status, 429); assert.deepEqual(f.row("account", key.account).blocked_until, until);
    f.advance(minutes * M);
  }
});

test("correct login resets account penalties; shared IP failures remain; only IP penalties decay after quiet", async () => {
  const f = fixture(), key = identity();
  for (let n = 0; n < 5; n++) await f.protect(key, failure);
  f.advance(M); await f.protect(key, success);
  assert.equal(f.row("account", key.account).failed_count, 0);
  assert.equal(f.row("account", key.account).penalty_level, 0);
  assert.equal(f.row("ip", key.ip).failed_count, 5);
  for (let n = 0; n < 5; n++) await f.protect(key, failure);
  assert.equal(f.row("account", key.account).penalty_level, 1);
  f.advance(24 * 60 * M);
  for (let n = 0; n < 5; n++) await f.protect(identity(key.account, "192.0.2.10"), failure);
  assert.equal(f.row("account", key.account).penalty_level, 2, "account escalation persists until successful login");
  const ip = fixture();
  for (let n = 0; n < 10; n++) await ip.protect(identity(`phone-${n}`, undefined, "admin"), failure);
  ip.advance(24 * 60 * M);
  for (let n = 0; n < 10; n++) await ip.protect(identity(`other-${n}`, undefined, "admin"), failure);
  assert.equal(ip.row("ip", key.ip, "admin").penalty_level, 1, "shared IP penalty decays after quiet");
});

test("admin ten failures across logins block IP 1/3/5 minutes; capped and never permanent", async () => {
  const f = fixture();
  for (const [cycle, minutes] of [1, 3, 5, 5].entries()) {
    for (let n = 0; n < 10; n++) {
      const result = await f.protect(identity(`phone-${cycle}-${n}`, undefined, "admin"), failure);
      assert.equal(result.status, n === 9 ? 429 : 401);
      if (n === 9) assert.equal(result.body.retryAfter, minutes * 60);
    }
    const count = f.state.size;
    assert.equal((await f.protect(identity("new-phone", undefined, "admin"), success)).status, 429);
    assert.equal(f.state.size, count, "blocked IP cannot allocate account rows");
    assert.equal((await f.protect(identity("other-ip", "192.0.2.2", "admin"), success)).status, 200);
    f.advance(minutes * M);
  }
});

test("public failures never block other phones on the same peer; account blocks survive IP changes", async () => {
  const f = fixture();
  for (let n = 0; n < 20; n++) {
    const key = identity(`phone-${n}`);
    for (let attempt = 0; attempt < 5; attempt++) await f.protect(key, failure);
  }
  assert.equal((await f.protect(identity("innocent"), success)).status, 200);
  assert.equal((await f.protect(identity("phone-0", "192.0.2.2"), success)).status, 429);
  assert.equal((await f.protect(identity("singleton-admin", undefined, "admin"), success)).status, 200);
});

test("concurrent requests serialize counters in the mock; lock order is IP then account", async () => {
  const f = fixture(); let checked = 0;
  const results = await Promise.all(Array.from({ length: 12 }, () => f.protect(identity(), async () => { checked++; return failure(); })));
  assert.equal(checked, 5); assert.equal(results.filter((r) => r.status === 401).length, 4);
  assert.equal(results.filter((r) => r.status === 429).length, 8);
  assert.equal(f.row("account", "+998901234567").penalty_level, 1);
  assert.match(f.calls.find((q) => q.startsWith("SELECT *")), /FOR UPDATE/);
  assert.ok(f.calls.some((q) => q.includes("ON CONFLICT")));
});

test("authentication and commit errors roll back counters, fail rather than bypass", async () => {
  for (const commit of [false, true]) {
    const f = fixture();
    if (commit) f.failCommit();
    await assert.rejects(f.protect(identity(), commit ? success : async () => { throw Error("injected authentication failure"); }));
    assert.equal(f.state.size, 0); assert.ok(f.calls.includes("ROLLBACK"));
  }
});

test("direct peer ignores spoofed forwarding; IPv4/mapped IPv6 and IPv6 spellings normalize", () => {
  const req = (ip) => ({ socket: { remoteAddress: ip }, ip: "203.0.113.1", headers: { "x-forwarded-for": "203.0.113.2" } });
  assert.equal(clientIp(req("192.0.2.1")), "192.0.2.1");
  assert.equal(clientIp(req("::ffff:192.0.2.1")), "192.0.2.1");
  assert.equal(clientIp(req("2001:0db8:0:0:0:0:0:1")), "2001:db8::1");
  assert.throws(() => clientIp(req("spoofed")));
  const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(body) { return body; } };
  sendLogin(res, { status: 429, body: { retryAfter: 300 } });
  assert.equal(res.headers["Retry-After"], "300"); assert.equal(res.headers["Cache-Control"], "no-store");
});

async function call(handler, body) {
  const req = { body, socket: { remoteAddress: "192.0.2.1" } };
  const res = { headers: {}, set(k, v) { this.headers[k] = v; }, status(v) { this.statusCode = v; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res); return res;
}

test("customer/barber canonical phone shares protection; correct other-role discovery is neutral", async () => {
  const prior = process.env.JWT_SECRET; process.env.JWT_SECRET = "login-unit-only-jwt-secret";
  try {
    const f = fixture(), phone = "+998901234567", password = "UnitPassword123";
    f.user({ user_id: 20, id: 45, phone, password: await hashPassword(password), role: "barber",
      first_name: "Ali", last_name: "Vali", verification_status: "pending", session_version: 3 });
    const customer = createRoleLogin("customer", f.pool), barber = createRoleLogin("barber", f.pool);
    assert.equal((await call(customer, { phone: "90 123 45 67", password })).statusCode, 401);
    assert.equal(f.row("ip", "192.0.2.1").failed_count, 0);
    const result = await call(barber, { phone, password });
    assert.equal(result.statusCode, 200); assert.equal(result.body.barber.id, 45);
    assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET).id, 20);
    assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET).sessionVersion, 3);
    assert.equal((await call(customer, { phone, password: "wrong" })).statusCode, 401);
    const wrongPassword = await call(barber, { phone, password: "wrong" });
    assert.equal(wrongPassword.statusCode, 401);
    assert.equal(wrongPassword.body.message, "Telefon raqami yoki parol noto'g'ri");
    assert.equal((await call(customer, { phone, password: "wrong" })).statusCode, 401);
    assert.equal((await call(barber, { phone, password: "wrong" })).statusCode, 401);
    assert.equal((await call(customer, { phone, password: "wrong" })).statusCode, 429);
    assert.equal((await call(barber, { phone, password })).statusCode, 429);
  } finally { if (prior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prior; }
});

test("unknown and existing phones have generic errors; malformed body fails; limiter outage fails closed", async () => {
  const f = fixture(); const handler = createRoleLogin("customer", f.pool);
  assert.equal((await call(handler, null)).statusCode, 400);
  const unknown = await call(handler, { phone: "+998901234567", password: "wrong" });
  assert.equal(unknown.statusCode, 401); assert.equal(unknown.body.message, "Telefon raqami yoki parol noto'g'ri");
  const outage = createRoleLogin("customer", { async connect() { throw Error("database unavailable"); } });
  assert.equal((await call(outage, { phone: "+998901234567", password: "wrong" })).statusCode, 503);
});

test("shared login resolves each database role with one authentication and one failure per request", async () => {
  const prior = process.env.JWT_SECRET; process.env.JWT_SECRET = "shared-login-unit-secret";
  try {
    for (const role of ["customer", "barber"]) {
      const f = fixture(), phone = "+998901234567", password = "SharedLogin123";
      f.user({ user_id: 25, id: 50, phone, password: await hashPassword(password), role,
        first_name: "Ali", last_name: "Vali", verification_status: "pending", session_version: 2 });
      const handler = createRoleLogin(null, f.pool);
      const result = await call(handler, { phone, password });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body[role].id, 50);
      assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET).role, role);
      assert.equal((await call(handler, { phone, password: "wrong" })).statusCode, 401);
      assert.equal(f.row("account", phone).failed_count, 1);
    }
  } finally { if (prior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prior; }
});

test("login accepts an existing password longer than the registration maximum", async () => {
  const prior = process.env.JWT_SECRET; process.env.JWT_SECRET = "long-password-login-unit-secret";
  try {
    const f = fixture(), phone = "+998901234567", password = `Legacy${"x".repeat(180)}7`;
    f.user({ user_id: 22, id: 47, phone, password: await hashPassword(password), role: "customer",
      first_name: "Ali", last_name: "Vali", session_version: 0 });
    const result = await call(createRoleLogin("customer", f.pool), { phone, password });
    assert.equal(result.statusCode, 200);
    assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET).id, 22);
  } finally { if (prior === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prior; }
});

test("admin keeps environment credentials, active singleton and JWT; varying login cannot bypass account limit", async () => {
  const f = fixture();
  const env = { ADMIN_LOGIN: "unit-admin", ADMIN_PASSWORD: "UnitAdmin123", JWT_SECRET: "unit-admin-jwt" };
  const handler = createAdminLogin(f.pool, env);
  assert.equal((await call(handler, { login: env.ADMIN_LOGIN, password: "wrong" })).statusCode, 401);
  const logged = await call(handler, { login: env.ADMIN_LOGIN, password: env.ADMIN_PASSWORD });
  assert.equal(logged.statusCode, 200); assert.equal(jwt.verify(logged.body.token, env.JWT_SECRET).role, "admin");
  f.adminActive(false);
  assert.equal((await call(handler, { login: env.ADMIN_LOGIN, password: env.ADMIN_PASSWORD })).statusCode, 401);
  assert.equal((await call(handler, { login: "other", password: "wrong" })).statusCode, 401);
  assert.equal((await call(handler, { login: "another", password: "wrong" })).statusCode, 401);
  assert.equal((await call(handler, { login: "fourth", password: "wrong" })).statusCode, 401);
  assert.equal((await call(handler, { login: "fifth", password: "wrong" })).statusCode, 429);
});

// Eski blok yozuvini o‘zgartirmasdan yangi vaqt siyosati ishlashi kerak.
test("legacy account and source blocks use last failure and never exceed five minutes", async () => {
  for (const kind of ["account", "ip"]) {
    const f = fixture(), key = identity();
    await f.protect(key, failure);
    const row = f.row(kind, kind === "account" ? key.account : key.ip);
    row.penalty_level = kind === "account" ? 4 : 3;
    row.failed_count = 0; row.window_started_at = null;
    row.blocked_until = new Date(+new Date(row.last_failed_at) + 60 * M);
    f.advance(2 * M);
    const result = await f.protect(key, success);
    assert.equal(result.status, 429);
    assert.equal(result.body.retryAfter, 180);
    f.advance(3 * M);
    assert.equal((await f.protect(key, success)).status, 200);
  }
});

test('temporarily deactivated account requires explicit reactivation after correct password', async () => {
  const prior=process.env.JWT_SECRET;process.env.JWT_SECRET='account-resume-unit-secret';
  try {
    const f=fixture(),phone='+998901234567',password='ResumePassword123!';
    f.user({user_id:25,id:50,phone,password:await hashPassword(password),role:'customer',
      first_name:'Ali',last_name:'Vali',session_version:3,deactivated_at:new Date('2026-11-17T00:00:00Z')});
    const login=createRoleLogin(null,f.pool);
    const normal=await call(login,{phone,password});
    assert.equal(normal.statusCode,423);assert.equal(normal.body.code,'account_deactivated');
    assert.equal(normal.body.token,undefined);
    const invalid=await call(login,{phone,password:'wrong',reactivate:true});
    assert.equal(invalid.statusCode,401);
    const resumed=await call(login,{phone,password,reactivate:true});
    assert.equal(resumed.statusCode,200);
    const claims=jwt.verify(resumed.body.token,process.env.JWT_SECRET);
    assert.equal(claims.sessionVersion,4);
    assert.ok(f.calls.some(q=>q.startsWith('UPDATE users SET deactivated_at=NULL')));
    assert.equal((await call(login,{phone,password})).statusCode,200);
  } finally {if(prior===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=prior;}
});
