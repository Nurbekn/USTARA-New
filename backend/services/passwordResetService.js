const { bodyObject, normalizePhone, sessionHash, OTP_PATTERN, createOtpCrypto, fail } = require("../utils/registration");
const passwords = require("../utils/passwordPolicy");
const { createOtpDelivery } = require("./otpDelivery");
const MINUTE = 60000;
const response = (status, code, message, extra = {}) => ({ status, body: { code, message, ...extra } });
const invalid = () => fail(401, "Parolni tiklash muddati tugagan yoki token yaroqsiz. Qayta boshlang.", "invalid_reset_session");
function tokenHash(value) { try { return sessionHash(value); } catch { throw invalid(); } }
const domainId = (id) => `password-reset:${id}`;

function createPasswordResetService({ pool, env = process.env, sms = createOtpDelivery({ pool, env }),
  otpCrypto = createOtpCrypto(env), passwordPolicy = passwords }) {
  async function transaction(work) {
    const client = await pool.connect(); let broken = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='3s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      const result = await work(client);
      // Wrong OTP counters and blocks are durable business results, not throws.
      await client.query("COMMIT"); return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }
  async function now(client) {
    return new Date((await client.query("SELECT date_trunc('milliseconds', clock_timestamp()) AS now")).rows[0].now);
  }
  async function event(client, phone, type, time, actor = null, reason = null) {
    await client.query(`INSERT INTO password_reset_events(phone,event_type,occurred_at,admin_account_id,reason)
      VALUES($1,$2,$3,$4,$5)`, [phone, type, time, actor, reason]);
  }
  async function lock(client, phone, create = false) {
    if (create) await client.query("INSERT INTO password_reset_limits(phone) VALUES($1) ON CONFLICT(phone) DO NOTHING", [phone]);
    const limit = (await client.query(`SELECT *,blocked_until='infinity'::timestamptz AS permanent
      FROM password_reset_limits WHERE phone=$1 FOR UPDATE`, [phone])).rows[0];
    const pending = (await client.query("SELECT * FROM password_reset_requests WHERE phone=$1 FOR UPDATE", [phone])).rows[0];
    return { limit, pending };
  }
  function blocked(limit, time) {
    if (limit.permanent || (limit.blocked_until && new Date(limit.blocked_until) > time)) {
      return response(423, "reset_blocked", "Parolni tiklash vaqtincha cheklangan.", {
        adminRequired: !!limit.permanent, blockedUntil: limit.permanent ? null : limit.blocked_until });
    }
    return null;
  }
  async function budget(client, limit, time) {
    if (limit.blocked_until) {
      await client.query(`UPDATE password_reset_limits SET send_count=0,last_sent_at=NULL,
        blocked_until=NULL,block_reason=NULL WHERE phone=$1`, [limit.phone]);
      limit.send_count = 0; limit.last_sent_at = null;
    }
    if (limit.send_count >= 3) {
      const level = Math.min(limit.penalty_level + 1, 2);
      const until = new Date(+time + (level === 1 ? 60 : 300) * MINUTE);
      await client.query(`UPDATE password_reset_limits SET penalty_level=$2,blocked_until=$3,block_reason='sms_limit'
        WHERE phone=$1`, [limit.phone, level, until]);
      await event(client, limit.phone, "sms_limit_blocked", time);
      return response(423, "reset_blocked", "Parolni tiklash vaqtincha cheklangan.", { adminRequired: false, blockedUntil: until });
    }
    if (limit.last_sent_at && +time - +new Date(limit.last_sent_at) < 3 * MINUTE) {
      return response(429, "resend_too_soon", "Yangi kod uchun 3 daqiqa kuting.", {
        retryAfter: Math.ceil((+new Date(limit.last_sent_at) + 3 * MINUTE - +time) / 1000) });
    }
    return null;
  }
  async function deliver(client, row, issue, time) {
    await client.query("UPDATE password_reset_limits SET send_count=send_count+1,last_sent_at=$2 WHERE phone=$1", [row.phone, time]);
    await event(client, row.phone, "reset_requested", time);
    // Unknown phones consume identical budgets and receive identical API payloads.
    // Provider failures must not turn into a known-phone-only observable error.
    if (row.user_id !== null) {
      try {
        await sms.send({ phone: row.phone, code: issue.code, client, purpose: 'password-reset', userId: row.user_id });
      } catch {
        await event(client, row.phone, "sms_delivery_failed", time);
        return;
      }
      await client.query('UPDATE password_reset_requests SET delivered_at=$2 WHERE phone=$1', [row.phone, time]);
    }
  }
  const sent = (time, extra = {}) => response(200, "reset_requested",
    "Agar hisob Telegramga bog‘langan va yetkazish imkoni bo‘lsa, kod yuboriladi. Kod kelmasa, botni oching yoki administratorga murojaat qiling.", {
      otpExpiresAt: new Date(+time + 3 * MINUTE), challengeExpiresAt: new Date(+time + 30 * MINUTE),
      resendAfter: 180, ...extra });
  async function start(input) {
    const phone = normalizePhone(bodyObject(input).phone);
    otpCrypto.ready(); sms.ready();
    return transaction(async (client) => {
      const { limit, pending } = await lock(client, phone, true);
      const time = await now(client);
      const rejection = blocked(limit, time) || await budget(client, limit, time);
      if (rejection) return rejection;
      const user = (await client.query("SELECT id FROM users WHERE phone=$1 AND role IN ('customer','barber')", [phone])).rows[0];
      const id = (await client.query("SELECT nextval(pg_get_serial_sequence('password_reset_requests','id'))::text AS id")).rows[0].id;
      const issue = otpCrypto.issue(phone, domainId(id));
      const challengeToken = otpCrypto.token();
      if (pending) await client.query("DELETE FROM password_reset_requests WHERE phone=$1", [phone]);
      await client.query(`INSERT INTO password_reset_requests
        (id,phone,user_id,challenge_token_hash,otp_hmac_hash,otp_hmac_key_id,otp_issuance_nonce,
         otp_sent_at,otp_expires_at,challenge_expires_at,otp_failed_attempts)
        OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, phone, user?.id ?? null, tokenHash(challengeToken), issue.hash, issue.keyId, issue.nonce,
        time, new Date(+time + 3 * MINUTE), new Date(+time + 30 * MINUTE), pending?.otp_failed_attempts || 0]);
      await deliver(client, { phone, user_id: user?.id ?? null }, issue, time);
      return sent(time, { challengeToken });
    });
  }
  async function withToken(input, kind, work) {
    const body = bodyObject(input), hash = tokenHash(body[kind === "challenge" ? "challengeToken" : "resetToken"]);
    const column = kind === "challenge" ? "challenge_token_hash" : "reset_token_hash";
    return transaction(async (client) => {
      const found = (await client.query(`SELECT phone FROM password_reset_requests WHERE ${column}=$1`, [hash])).rows[0];
      if (!found) throw invalid();
      const { limit, pending } = await lock(client, found.phone);
      if (!limit || !pending || pending[column] !== hash) throw invalid();
      const time = await now(client), rejection = blocked(limit, time);
      if (rejection) return rejection;
      const expiry = kind === "challenge" ? pending.challenge_expires_at : pending.reset_expires_at;
      if (!expiry || +new Date(expiry) <= +time) throw invalid();
      return work(client, limit, pending, time, body);
    });
  }
  async function resend(input) {
    otpCrypto.ready(); sms.ready();
    return withToken(input, "challenge", async (client, limit, row, time) => {
      const rejection = await budget(client, limit, time); if (rejection) return rejection;
      let issue = otpCrypto.issue(row.phone, domainId(row.id));
      while (otpCrypto.matches({ ...row, id: domainId(row.id) }, issue.code)) issue = otpCrypto.issue(row.phone, domainId(row.id));
      await client.query(`UPDATE password_reset_requests SET delivered_at=NULL,otp_hmac_hash=$2,otp_hmac_key_id=$3,
        otp_issuance_nonce=$4,otp_sent_at=$5,otp_expires_at=$6,challenge_expires_at=$7 WHERE phone=$1`,
      [row.phone, issue.hash, issue.keyId, issue.nonce, time, new Date(+time + 3 * MINUTE), new Date(+time + 30 * MINUTE)]);
      await deliver(client, row, issue, time); return sent(time);
    });
  }
  async function verify(input) {
    const body = bodyObject(input);
    const validCode = typeof body.otp === 'string' && OTP_PATTERN.test(body.otp);
    otpCrypto.ready();
    return withToken(body, "challenge", async (client, limit, row, time) => {
      if (+new Date(row.otp_expires_at) <= +time) return response(400, "otp_expired", "Kod muddati tugagan. Yangi kod so'rang.");
      const matches = otpCrypto.matches({ ...row, id: domainId(row.id) }, validCode ? body.otp : 'invalid');
      if (!validCode || !matches || row.user_id === null || !row.delivered_at) {
        const attempts = row.otp_failed_attempts + 1;
        await client.query("UPDATE password_reset_requests SET otp_failed_attempts=$2 WHERE phone=$1", [row.phone, attempts]);
        await event(client, row.phone, "otp_rejected", time);
        if (attempts >= 5) {
          await client.query(`UPDATE password_reset_limits SET blocked_until='infinity',block_reason='otp_attempts' WHERE phone=$1`, [row.phone]);
          await client.query("DELETE FROM password_reset_requests WHERE phone=$1", [row.phone]);
          await event(client, row.phone, "otp_attempts_blocked", time);
          return response(423, "reset_blocked", "Administrator orqali blokdan chiqing.", { adminRequired: true, blockedUntil: null });
        }
        return response(400, "invalid_otp", "Kod noto'g'ri.", { attemptsRemaining: 5 - attempts });
      }
      const resetToken = otpCrypto.token(), resetExpiresAt = new Date(+time + 5 * MINUTE);
      await client.query(`UPDATE password_reset_requests SET verified_at=$2,reset_expires_at=$3,
        reset_token_hash=$4,challenge_token_hash=NULL WHERE phone=$1`, [row.phone, time, resetExpiresAt, tokenHash(resetToken)]);
      await event(client, row.phone, "otp_verified", time);
      return response(200, "reset_verified", "Yangi parolni kiriting.", { resetToken, resetExpiresAt });
    });
  }
  async function complete(input) {
    const body = bodyObject(input), error = passwordPolicy.validateRegistrationPassword(body.password);
    if (error) throw fail(400, error, "invalid_password");
    return withToken(body, "reset", async (client, limit, row, time) => {
      if (!row.verified_at || row.user_id === null) throw invalid();
      const user = (await client.query("SELECT id FROM users WHERE id=$1 AND phone=$2 AND role IN ('customer','barber') FOR UPDATE", [row.user_id, row.phone])).rows[0];
      if (!user) throw invalid();
      const hash = await passwordPolicy.hashPassword(body.password);
      // Recheck the deadline after waiting for the account lock and bcrypt.
      const finishedAt = await now(client);
      if (+new Date(row.reset_expires_at) <= +finishedAt) throw invalid();
      await client.query("UPDATE users SET password=$2 WHERE id=$1", [user.id, hash]);
      await client.query(`INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
        ON CONFLICT(user_id) DO UPDATE SET version=account_session_versions.version+1`, [user.id]);
      await client.query("DELETE FROM password_reset_requests WHERE phone=$1", [row.phone]);
      await event(client, row.phone, "password_reset_completed", finishedAt);
      // Login brute-force and registration restrictions are deliberately retained.
      return response(200, "password_reset_completed", "Parol yangilandi. Yangi parol bilan kiring.");
    });
  }
  async function unblock(input, actor) {
    const body = bodyObject(input), phone = normalizePhone(body.phone);
    if (actor?.role !== "admin" || !Number.isInteger(actor.id) || actor.id <= 0) throw fail(403, "Faqat admin uchun.", "admin_required");
    if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500 || /[\x00-\x1f\x7f]/.test(body.reason)) {
      throw fail(400, "Sababni kiriting (1–500 belgi).", "invalid_reason");
    }
    return transaction(async (client) => {
      await lock(client, phone, true);
      const admin = await client.query("SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE", [actor.id]);
      if (!admin.rowCount) throw fail(403, "Faqat faol admin uchun.", "admin_required");
      await client.query(`UPDATE password_reset_limits SET send_count=0,penalty_level=0,last_sent_at=NULL,
        blocked_until=NULL,block_reason=NULL WHERE phone=$1`, [phone]);
      await client.query("DELETE FROM password_reset_requests WHERE phone=$1", [phone]);
      await event(client, phone, "admin_unblocked", await now(client), actor.id, body.reason.trim());
      return response(200, "reset_unblocked", "Parolni tiklash bloki olib tashlandi.");
    });
  }
  return { start, resend, verify, complete, unblock };
}
module.exports = { createPasswordResetService };
