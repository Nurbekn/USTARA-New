const assert = require("node:assert/strict");
function createPasswordResetPool() {
  let state = { limits: [], requests: [], events: [], versions: [], adminActive: true,
    users: [{ id: 7, phone: "+998901234567", role: "customer", password: "old-hash" },
      { id: 8, phone: "+998901234568", role: "barber", password: "old-hash" }] };
  let clock = new Date("2026-11-14T00:00:00.000Z"), nextId = 1, tail = Promise.resolve();
  const rows = (values) => ({ rows: structuredClone(values), rowCount: values.length });
  const calls = [];
  const pool = {
    calls, fault: null, get state() { return state; },
    advance(ms) { clock = new Date(+clock + ms); },
    async query(sql, args) {
      if (sql.startsWith("SELECT id FROM admin_accounts")) return rows(state.adminActive && args[0] === 1 ? [{ id: 1 }] : []);
      if (sql.startsWith("SELECT version FROM account_session_versions")) return rows(state.versions.filter((v) => v.user_id === args[0]));
      if (sql.startsWith("SELECT profile.id")) return rows(state.users.some((u) => u.id === args[1] && u.role === args[2]) ? [{ id: args[0] }] : []);
      throw Error("Unexpected nontransactional mock SQL");
    },
    async connect() {
      let local, unlock, ended = false, lockedPhone;
      return { release() { assert.ok(ended, "transaction must end before release"); }, async query(sql, args = []) {
        const q = sql.replace(/\s+/g, " ").trim(); calls.push(q);
        if (pool.fault && q.includes(pool.fault)) { pool.fault = null; throw Error("injected database failure"); }
        if (q === "BEGIN") {
          const previous = tail; tail = new Promise((r) => { unlock = r; }); await previous;
          local = structuredClone(state); return rows([]);
        }
        if (q === "COMMIT" || q === "ROLLBACK") {
          if (q === "COMMIT") state = local;
          ended = true; unlock(); return rows([]);
        }
        assert.ok(local, "transaction required");
        const [a,b,c,d,e,f,g,h,i,j,k] = args;
        const limit = () => local.limits.find((r) => r.phone === a);
        const pending = () => local.requests.find((r) => r.phone === a);
        if (q.startsWith("SET LOCAL")) return rows([]);
        if (q.startsWith("SELECT date_trunc")) { assert.ok(lockedPhone); return rows([{ now: clock }]); }
        if (q.startsWith("INSERT INTO password_reset_limits")) {
          if (!limit()) local.limits.push({ phone: a, send_count: 0, penalty_level: 0, last_sent_at: null, blocked_until: null, block_reason: null });
        } else if (q.startsWith("SELECT *,blocked_until")) {
          lockedPhone = a; return rows(limit() ? [{ ...limit(), permanent: limit().blocked_until === "infinity" }] : []);
        } else if (q.startsWith("SELECT * FROM password_reset_requests")) {
          assert.equal(lockedPhone, a, "limit must lock before pending"); return rows(pending() ? [pending()] : []);
        } else if (q.startsWith("SELECT phone FROM password_reset_requests")) {
          const key = q.includes("challenge_token_hash") ? "challenge_token_hash" : "reset_token_hash";
          return rows(local.requests.filter((r) => r[key] === a).map((r) => ({ phone: r.phone })));
        } else if (q.startsWith("SELECT id FROM users WHERE phone")) {
          return rows(local.users.filter((u) => u.phone === a));
        } else if (q.startsWith("SELECT id FROM users WHERE id")) {
          return rows(local.users.filter((u) => u.id === a && u.phone === b));
        } else if (q.startsWith("SELECT id FROM admin_accounts")) {
          return rows(local.adminActive && a === 1 ? [{ id: 1 }] : []);
        } else if (q.startsWith("SELECT nextval")) { return rows([{ id: String(nextId++) }]);
        } else if (q.startsWith("INSERT INTO password_reset_requests")) {
          local.requests.push({ id: a, phone: b, user_id: c, challenge_token_hash: d, otp_hmac_hash: e,
            otp_hmac_key_id: f, otp_issuance_nonce: g, otp_sent_at: h, otp_expires_at: i, challenge_expires_at: j,
            otp_failed_attempts: k, verified_at: null, reset_expires_at: null, reset_token_hash: null });
        } else if (q.startsWith("DELETE FROM password_reset_requests")) { local.requests = local.requests.filter((r) => r.phone !== a);
        } else if (q.startsWith("INSERT INTO password_reset_events")) {
          local.events.push({ phone: a, event_type: b, occurred_at: c, admin_account_id: d, reason: e });
        } else if (q.startsWith("UPDATE password_reset_limits SET send_count=send_count+1")) {
          Object.assign(limit(), { send_count: limit().send_count + 1, last_sent_at: b });
        } else if (q.startsWith("UPDATE password_reset_limits SET send_count=0")) {
          Object.assign(limit(), { send_count: 0, last_sent_at: null, blocked_until: null, block_reason: null });
          if (q.includes("penalty_level=0")) limit().penalty_level = 0;
        } else if (q.startsWith("UPDATE password_reset_limits SET penalty_level")) {
          Object.assign(limit(), { penalty_level: b, blocked_until: c, block_reason: "sms_limit" });
        } else if (q.startsWith("UPDATE password_reset_limits SET blocked_until='infinity'")) {
          Object.assign(limit(), { blocked_until: "infinity", block_reason: "otp_attempts" });
        } else if (q.startsWith('UPDATE password_reset_requests SET delivered_at=$2')) {
          pending().delivered_at = b;
        } else if (q.startsWith("UPDATE password_reset_requests SET delivered_at=NULL,otp_hmac_hash")) {
          Object.assign(pending(), { otp_hmac_hash: b, otp_hmac_key_id: c, otp_issuance_nonce: d,
            otp_sent_at: e, otp_expires_at: f, challenge_expires_at: g, delivered_at: null });
        } else if (q.startsWith("UPDATE password_reset_requests SET otp_failed_attempts")) { pending().otp_failed_attempts = b;
        } else if (q.startsWith("UPDATE password_reset_requests SET verified_at")) {
          Object.assign(pending(), { verified_at: b, reset_expires_at: c, reset_token_hash: d, challenge_token_hash: null });
        } else if (q.startsWith("UPDATE users SET password")) { local.users.find((u) => u.id === a).password = b;
        } else if (q.startsWith("INSERT INTO account_session_versions")) {
          const version = local.versions.find((v) => v.user_id === a);
          if (version) version.version++; else local.versions.push({ user_id: a, version: 1 });
        } else throw Error("Unsupported password reset mock SQL");
        return rows([]);
      } };
    },
  };
  return pool;
}
module.exports = { createPasswordResetPool };
