const assert = require("node:assert/strict");

// A deterministic transaction double, NOT PostgreSQL or a concurrency proof.
// No pg/db/dotenv imports, sockets, filesystem reads, or database connections.
function createMemoryPool() {
  let state = { telegramRequests: [], loginLimits: [], limits: [], pending: [], history: [], users: [], customers: [], barbers: [], events: [], actions: [], deviceSessions: [], adminActive: true };
  let nextId = 1;
  let tail = Promise.resolve();
  let time = new Date("2026-11-14T10:00:00.000Z");
  const calls = [];
  const pool = {
    calls, released: 0, fault: null,
    get state() { return state; },
    advance(ms) { time = new Date(time.getTime() + ms); },
    async connect() {
      let local;
      let unlock;
      let lockedPhone;
      let pendingLocked = false;
      let ended = false;
      const rows = (values) => ({ rows: structuredClone(values), rowCount: values.length });
      return {
        release() { assert.ok(ended, "transaction must finish before release"); pool.released++; },
        async query(sql, args = []) {
          const q = sql.replace(/\s+/g, " ").trim();
          calls.push(q);
          if (pool.fault && q.includes(pool.fault)) {
            pool.fault = null;
            throw new Error("simulated storage failure");
          }
          if (q === "BEGIN") {
            const previous = tail;
            tail = new Promise((resolve) => { unlock = resolve; });
            await previous;
            local = structuredClone(state);
            return rows([]);
          }
          if (q === "COMMIT" || q === "ROLLBACK") {
            if (q === "COMMIT") state = local;
            ended = true;
            unlock();
            return rows([]);
          }
          assert.ok(local, "SQL requires an open transaction");
          const [a,b,c,d,e,f,g,h,i,j,k,l] = args;
          const limit = () => local.limits.find((row) => row.phone === a);
          const pending = () => local.pending.find((row) => String(row.id) === String(a));
          if (q.startsWith('INSERT INTO telegram_registration_requests')) {
            local.telegramRequests = local.telegramRequests.filter(r => String(r.registration_id) !== String(a));
            local.telegramRequests.push({registration_id:a,bot_id:b,token_hash:c,expires_at:d,chat_id:null,delivered_at:null});
            return rows([]);
          }
          if (q.startsWith('SELECT delivered_at FROM telegram_registration_requests')) {
            return rows(local.telegramRequests.filter(r => String(r.registration_id) === String(a) && r.bot_id === b
              && (!q.includes('FOR UPDATE') || r.token_hash === c && (r.chat_id === null || r.chat_id === d) && +new Date(r.expires_at) > +time)));
          }
          if (q.startsWith('UPDATE telegram_registration_requests SET chat_id=')) {
            local.telegramRequests.find(r => String(r.registration_id) === String(a)).chat_id=b;
            return rows([]);
          }
          if (q.startsWith('UPDATE telegram_registration_requests SET delivered_at')) {
            local.telegramRequests.find(r => String(r.registration_id) === String(a)).delivered_at=b;
            return rows([]);
          }
          if (q.startsWith('UPDATE telegram_otp_contacts c SET user_id=')) {
            assert.ok(local.telegramRequests.some(r => String(r.registration_id) === String(a) && r.delivered_at && r.chat_id));
            return rows([{phone:d}]);
          }
          if (q.startsWith("SET LOCAL")) return rows([]);
          if (q === "SELECT clock_timestamp() AS time") return rows([{ time }]);
          const loginLimit = () => local.loginLimits.find((row) => row.scope === a && row.kind === b && row.key_hash === c);
          if (q.startsWith("INSERT INTO login_attempt_limits")) {
            if (!loginLimit()) local.loginLimits.push({ scope: a, kind: b, key_hash: c, failed_count: 0,
              penalty_level: 0, window_started_at: null, last_failed_at: null, blocked_until: null });
            return rows([]);
          }
          if (q.startsWith("SELECT * FROM login_attempt_limits")) return rows([loginLimit()]);
          if (q.startsWith("UPDATE login_attempt_limits")) {
            Object.assign(loginLimit(), args.length === 3
              ? { failed_count: 0, penalty_level: 0, window_started_at: null, last_failed_at: null, blocked_until: null }
              : { failed_count: d, penalty_level: e, window_started_at: f, last_failed_at: g, blocked_until: h });
            return rows([]);
          }
          if (q.startsWith("SELECT u.id AS user_id")) {
            const role = q.includes("JOIN customers") ? "customer" : "barber";
            const user = local.users.find((row) => row.phone === a);
            if (!user) return rows([]);
            const profile = local[role === "customer" ? "customers" : "barbers"].find((row) => row.user_id === user.id);
            return rows([{ ...profile, id: profile?.id || null, user_id: user.id, phone: user.phone, role: user.role, password: user.password }]);
          }
          if (q.startsWith("SELECT date_trunc")) {
            assert.ok(pendingLocked, "read server clock after pending row lock");
            return rows([{ now: time }]);
          }
          if (q.startsWith("INSERT INTO registration_phone_limits")) {
            if (!limit()) local.limits.push({ phone: a, send_count: 0, penalty_level: 0, last_sent_at: null, blocked_until: null });
          } else if (q.startsWith("SELECT *, blocked_until")) {
            lockedPhone = a;
            return rows(limit() ? [{ ...limit(), permanent: limit().blocked_until === "infinity" }] : []);
          } else if (q.startsWith("SELECT * FROM pending_registrations")) {
            assert.equal(lockedPhone, a, "phone-limit lock precedes pending lock");
            pendingLocked = true;
            return rows(local.pending.filter((row) => row.phone === a));
          } else if (q.startsWith("SELECT phone FROM pending_registrations")) {
            return rows(local.pending.filter((row) => row.session_token_hash === a).map((row) => ({ phone: row.phone })));
          } else if (q.startsWith("SELECT id FROM users")) {
            return rows(local.users.filter((row) => row.phone === a).map((row) => ({ id: row.id })));
          } else if (q.startsWith("SELECT id FROM admin_accounts")) {
            return rows(local.adminActive && (a ?? 1) === 1 ? [{ id: 1 }] : []);
          } else if (q.startsWith("SELECT nextval")) {
            return rows([{ id: String(nextId++) }]);
          } else if (q.startsWith("INSERT INTO pending_registrations")) {
            local.pending.push({ id: a, phone: b, role: c, password_hash: d, otp_hmac_hash: e,
              otp_hmac_key_id: f, otp_issuance_nonce: g, otp_sent_at: h, otp_expires_at: i,
              otp_failed_attempts: j, session_token_hash: k, session_expires_at: l, specialty: args[12],
              created_at: h, updated_at: h, phone_verified_at: null, completion_expires_at: null });
          } else if (q.startsWith("INSERT INTO registration_otp_history")) {
            local.history.push({ phone: a, registration_id: b, issuance_nonce: c, otp_hmac_hash: d,
              otp_hmac_key_id: e, sent_at: f, expires_at: g, invalidated_at: null, invalidation_reason: null });
          } else if (q.startsWith("INSERT INTO registration_security_events")) {
            local.events.push({ phone: a, event_type: b, occurred_at: c });
          } else if (q.startsWith("INSERT INTO registration_admin_actions")) {
            local.actions.push({ admin_account_id: a, phone: b, action_type: "unblock", occurred_at: c, reason: d });
          } else if (q.startsWith("UPDATE registration_phone_limits SET send_count=send_count+1")) {
            limit().send_count++;
            limit().last_sent_at = b;
          } else if (q.startsWith("UPDATE registration_phone_limits SET send_count=3")) {
            Object.assign(limit(), { send_count: 3, penalty_level: b, blocked_at: c, block_reason: "sms_limit", blocked_until: d });
          } else if (q.startsWith("UPDATE registration_phone_limits SET send_count=0")) {
            Object.assign(limit(), { send_count: 0, last_sent_at: null, blocked_at: null, block_reason: null, blocked_until: null });
            if (q.includes("admin_unblocked_at")) Object.assign(limit(), { penalty_level: 0, admin_unblocked_at: b });
          } else if (q.startsWith("UPDATE registration_phone_limits SET blocked_at")) {
            Object.assign(limit(), { blocked_at: b, block_reason: "otp_attempts", blocked_until: "infinity" });
          } else if (q.startsWith("UPDATE registration_otp_history SET invalidated_at")) {
            local.history.filter((row) => row.phone === a && row.invalidated_at === null)
              .forEach((row) => Object.assign(row, { invalidated_at: b, invalidation_reason: c }));
          } else if (q.startsWith("UPDATE registration_otp_history SET verified_at")) {
            local.history.filter((row) => row.registration_id === a && row.issuance_nonce === b && row.invalidated_at === null)
              .forEach((row) => { row.verified_at = c; });
          } else if (q.startsWith("UPDATE pending_registrations SET resend_available_at")) {
            Object.assign(pending(), { resend_available_at: b });
          } else if (q.startsWith("UPDATE pending_registrations SET otp_hmac_hash")) {
            Object.assign(pending(), { otp_hmac_hash: b, otp_hmac_key_id: c, otp_issuance_nonce: d,
              otp_sent_at: e, otp_expires_at: f, session_expires_at: g });
          } else if (q.startsWith("UPDATE pending_registrations SET otp_failed_attempts")) {
            Object.assign(pending(), { otp_failed_attempts: b, updated_at: c });
          } else if (q.startsWith("UPDATE pending_registrations SET phone_verified_at")) {
            Object.assign(pending(), { phone_verified_at: b, completion_expires_at: c, updated_at: b });
          } else if (q.startsWith("DELETE FROM pending_registrations")) {
            local.pending = local.pending.filter((row) => String(row.id) !== String(a));
            local.telegramRequests = local.telegramRequests.filter(row => String(row.registration_id) !== String(a));
          } else if (q.startsWith("INSERT INTO users(")) {
            if (local.users.some((row) => row.phone === a)) {
              const error = new Error("simulated duplicate"); error.code = "23505"; throw error;
            }
            const user = { id: nextId++, phone: a, password: b, role: c };
            local.users.push(user);
            return rows([{ id: user.id, phone: a, role: c }]);
          } else if (q.startsWith('INSERT INTO account_device_sessions(')) {
            local.deviceSessions.push({ session_id: a, user_id: b, device_label: c });
          } else if (/^INSERT INTO (customers|barbers)\(/.test(q)) {
            const table = q.startsWith("INSERT INTO customers") ? "customers" : "barbers";
            const profile = { id: nextId++ + 100, user_id: a, first_name: b, last_name: c, created_at: time,
              ...(table === "barbers" ? { verification_status: "pending", specialty: d } : {}) };
            local[table].push(profile);
            const { user_id, ...returned } = profile;
            return rows([returned]);
          } else {
            throw new Error(`Unsupported test SQL: ${q}`);
          }
          return rows([]);
        },
      };
    },
  };
  return pool;
}

module.exports = { createMemoryPool };
