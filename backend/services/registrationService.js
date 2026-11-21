const jwt = require("jsonwebtoken");
const { createDeviceSession } = require("./deviceSessions");
const passwordPolicy = require("../utils/passwordPolicy");
const { fail, bodyObject, normalizePhone, sessionHash, names, OTP_PATTERN, createOtpCrypto } = require("../utils/registration");
const { createTelegramRegistration } = require("./telegramRegistration");
const { createOtpDelivery } = require("./otpDelivery");

const MINUTE = 60 * 1000;
const OTP_TTL = MINUTE;
const COMPLETION_TTL = 15 * MINUTE;
const SESSION_TTL = 30 * MINUTE;
const response = (status, message, code, extra = {}) => ({ status, body: { message, code, ...extra } });
const invalidSession = () => fail(401, "Registration session yaroqsiz yoki muddati tugagan", "invalid_session");

function createRegistrationService({ pool, env = process.env, sms = createOtpDelivery({ pool, env }),
  otpCrypto = createOtpCrypto(env), passwords = passwordPolicy,
  signToken = (payload) => jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" }) }) {
  const telegram = sms.deferredRegistration ? createTelegramRegistration({ pool, env }) : null;
  async function transaction(work) {
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      // Business rejections can have durable counters, blocks and audit events.
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  async function now(client) {
    // Read AFTER row locks: transaction-start NOW() could already be stale.
    // Millisecond precision keeps JS timestamps and SQL equality CHECKs aligned.
    const result = await client.query("SELECT date_trunc('milliseconds', clock_timestamp()) AS now");
    return new Date(result.rows[0].now);
  }

  async function event(client, phone, type, time) {
    await client.query(
      "INSERT INTO registration_security_events(phone,event_type,occurred_at) VALUES($1,$2,$3)",
      [phone, type, time],
    );
  }

  async function lockLimit(client, phone, create = false) {
    if (create) await client.query(
      "INSERT INTO registration_phone_limits(phone) VALUES($1) ON CONFLICT(phone) DO NOTHING", [phone],
    );
    const result = await client.query(
      `SELECT *, blocked_until = 'infinity'::timestamptz AS permanent
       FROM registration_phone_limits WHERE phone=$1 FOR UPDATE`, [phone],
    );
    return result.rows[0];
  }

  async function lockPending(client, phone) {
    const result = await client.query("SELECT * FROM pending_registrations WHERE phone=$1 FOR UPDATE", [phone]);
    return result.rows[0];
  }

  function blocked(limit, time) {
    if (limit.permanent || (limit.blocked_until && new Date(limit.blocked_until).getTime() > time.getTime())) {
      return response(423, "Telefon raqami bloklangan", "registration_blocked", {
        adminRequired: Boolean(limit.permanent),
        blockedUntil: limit.permanent ? null : limit.blocked_until,
      });
    }
    return null;
  }

  async function sendBudget(client, limit, time, deferDelivery = false) {
    if (limit.blocked_until) {
      // Permanent blocks were rejected above; only an expired timed block resets.
      await client.query(
        `UPDATE registration_phone_limits SET send_count=0,last_sent_at=NULL,
         blocked_at=NULL,block_reason=NULL,blocked_until=NULL,updated_at=$2 WHERE phone=$1`,
        [limit.phone, time],
      );
      limit.send_count = 0;
      limit.last_sent_at = null;
    }
    if (limit.send_count >= 3) {
      const level = Math.min(limit.penalty_level + 1, 2);
      const until = new Date(time.getTime() + (level === 1 ? 60 : 300) * MINUTE);
      await client.query(
        `UPDATE registration_phone_limits SET send_count=3,penalty_level=$2,
         blocked_at=$3,block_reason='sms_limit',blocked_until=$4,updated_at=$3 WHERE phone=$1`,
        [limit.phone, level, time, until],
      );
      await event(client, limit.phone, "sms_limit_blocked", time);
      return response(423, "SMS yuborish limiti tugadi", "sms_limit", { blockedUntil: until, adminRequired: false });
    }
    if (!deferDelivery && limit.last_sent_at && time.getTime() - new Date(limit.last_sent_at).getTime() < OTP_TTL) {
      return response(429, "Qayta yuborish uchun 1 daqiqa kuting", "resend_too_soon", {
        retryAfter: Math.ceil((new Date(limit.last_sent_at).getTime() + OTP_TTL - time.getTime()) / 1000),
      });
    }
    return null;
  }

  async function invalidate(client, phone, time, reason) {
    await client.query(
      `UPDATE registration_otp_history SET invalidated_at=$2,invalidation_reason=$3
       WHERE phone=$1 AND invalidated_at IS NULL`, [phone, time, reason],
    );
  }

  async function recordSend(client, pending, issuance, time) {
    await client.query(
      `INSERT INTO registration_otp_history
       (phone,registration_id,issuance_nonce,otp_hmac_hash,otp_hmac_key_id,sent_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [pending.phone, pending.id, issuance.nonce, issuance.hash, issuance.keyId, time, new Date(time.getTime() + OTP_TTL)],
    );
    await client.query(
      `UPDATE registration_phone_limits SET send_count=send_count+1,last_sent_at=$2,updated_at=$2 WHERE phone=$1`,
      [pending.phone, time],
    );
    await event(client, pending.phone, "otp_sent", time);
    // Provayder xatosi shu transactiondagi OTP va yuborish limiti yozuvlarini bekor qiladi.
    await sms.send({ phone: pending.phone, code: issuance.code, client });
  }

  function sent(status, issuance, time, extra = {}) {
    return response(status, "Tasdiqlash kodi yuborildi", "otp_sent", {
      otpExpiresAt: new Date(time.getTime() + OTP_TTL), resendAfter: 60,
      ...extra,
      ...(env.NODE_ENV === "test" && sms.exposeCode() ? { testOtp: issuance.code } : {}),
    });
  }

  function cooldown(pending, time) {
    const available = new Date(pending.resend_available_at || new Date(pending.created_at).getTime() + MINUTE);
    return { serverNow: time, resendAvailableAt: available,
      resendAfter: Math.max(0, Math.ceil((available.getTime() - time.getTime()) / 1000)) };
  }

  async function beginCooldown(client, id, time) {
    const available = new Date(time.getTime() + MINUTE);
    await client.query('UPDATE pending_registrations SET resend_available_at=$2 WHERE id=$1', [id, available]);
    return { serverNow: time, resendAvailableAt: available, resendAfter: 60 };
  }

  async function withSession(body, work) {
    const tokenHash = sessionHash(bodyObject(body).sessionToken);
    return transaction(async (client) => {
      // Discovery only: no pending row lock until the phone-limit lock is held.
      const found = await client.query("SELECT phone FROM pending_registrations WHERE session_token_hash=$1", [tokenHash]);
      if (!found.rows[0]) throw invalidSession();
      const phone = found.rows[0].phone;
      const limit = await lockLimit(client, phone);
      const pending = await lockPending(client, phone);
      // Recheck the token under lock after concurrent start/complete/unblock.
      if (!limit || !pending || pending.session_token_hash !== tokenHash) throw invalidSession();
      const time = await now(client);
      const rejection = blocked(limit, time);
      if (rejection) return rejection;
      if (pending.otp_failed_attempts >= 5) {
        await blockAttempts(client, phone, time);
        return response(423, "Telefon raqami bloklangan", "registration_blocked", { adminRequired: true });
      }
      return work(client, pending, limit, time);
    });
  }

  async function start(input) {
    const body = bodyObject(input);
    const phone = normalizePhone(body.phone);
    if (!["customer", "barber"].includes(body.role)) throw fail(400, "Rol customer yoki barber bo'lishi kerak", "invalid_role");
    const specialty = body.role === "barber" ? body.specialty : null;
    if (body.role === "barber" && !["barber", "cosmetolog", "stylist"].includes(specialty)) {
      throw fail(400, "Barber mutaxassisligi barber, cosmetolog yoki stylist bo'lishi kerak", "invalid_specialty");
    }
    const passwordError = passwords.validateRegistrationPassword(body.password);
    if (passwordError) throw fail(400, passwordError, "invalid_password");
    otpCrypto.ready();
    sms.ready();
    const passwordHash = await passwords.hashPassword(body.password);
    return transaction(async (client) => {
      const limit = await lockLimit(client, phone, true);
      const previous = await lockPending(client, phone);
      const time = await now(client);
      const rejection = blocked(limit, time);
      if (rejection) return rejection;
      // Retain the security boundary for pending rows left by older writers.
      const attempts = previous?.otp_failed_attempts || 0;
      if (attempts >= 5) {
        await blockAttempts(client, phone, time);
        return response(423, "Telefon raqami bloklangan", "registration_blocked", { adminRequired: true });
      }
      const account = await client.query("SELECT id FROM users WHERE phone=$1", [phone]);
      if (account.rowCount) return response(409, "Bu telefon raqami allaqachon ro'yxatdan o'tgan", "phone_exists");
      // Preparing a Telegram request sends nothing. Retain the send cooldown at
      // delivery, but never make an abandoned website session block a new one.
      const budget = await sendBudget(client, limit, time, !!telegram);
      if (budget) return budget;
      // Serialize replacement with verify/complete/delivery using the phone locks.
      // Never transfer an old session credential or verified/completion state.
      // The FK cascade revokes its Telegram generation; security counters survive.
      await invalidate(client, phone, time, "registration_restarted");
      if (previous) await client.query("DELETE FROM pending_registrations WHERE id=$1", [previous.id]);
      const sequence = await client.query("SELECT nextval(pg_get_serial_sequence('pending_registrations','id'))::text AS id");
      const id = sequence.rows[0].id;
      const issuance = otpCrypto.issue(phone, id);
      const sessionToken = otpCrypto.token();
      const sessionExpiresAt = new Date(time.getTime() + SESSION_TTL);
      await client.query(
        `INSERT INTO pending_registrations
         (id,phone,role,password_hash,otp_hmac_hash,otp_hmac_key_id,otp_issuance_nonce,
          otp_sent_at,otp_expires_at,otp_failed_attempts,session_token_hash,session_expires_at,created_at,updated_at,specialty)
         OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$8,$8,$13)`,
        [id, phone, body.role, passwordHash, issuance.hash, issuance.keyId, issuance.nonce, time,
          new Date(time.getTime() + OTP_TTL), attempts, sessionHash(sessionToken), sessionExpiresAt, specialty],
      );
      if (telegram) {
        const delivery = await telegram.prepare(client, { id, session_expires_at: sessionExpiresAt });
        return response(201, "Bot orqali kod olish uchun davom eting", "telegram_delivery_pending", {
          sessionToken, sessionExpiresAt, restarted: !!previous,
          deliveryRetryAfter: limit.last_sent_at
            ? Math.max(0, Math.ceil((new Date(limit.last_sent_at).getTime() + OTP_TTL - time.getTime()) / 1000)) : 0,
          ...delivery,
          ...await beginCooldown(client, id, time),
        });
      }
      await recordSend(client, { id, phone }, issuance, time);
      return sent(201, issuance, time, { sessionToken, sessionExpiresAt, restarted: !!previous });
    });
  }

  async function resend(input) {
    bodyObject(input);
    otpCrypto.ready();
    sms.ready();
    return withSession(input, async (client, pending, limit, time) => {
      if (pending.phone_verified_at) return response(409, "Telefon allaqachon tasdiqlangan", "already_verified");
      if (new Date(pending.session_expires_at).getTime() <= time.getTime()) throw invalidSession();
      if (telegram && cooldown(pending, time).resendAfter > 0) {
        return response(429, "Qayta yuborish uchun kuting", "resend_too_soon", {
          retryAfter: cooldown(pending, time).resendAfter, ...cooldown(pending, time),
        });
      }
      const budget = await sendBudget(client, limit, time);
      if (budget) return budget;
      if (telegram) {
        await invalidate(client, pending.phone, time, "superseded");
        return response(200, "Botdan yangi kod oling", "telegram_delivery_pending", {
          sessionExpiresAt: pending.session_expires_at, ...await telegram.prepare(client, pending),
          ...await beginCooldown(client, pending.id, time),
        });
      }
      return issueOtp(client, pending, time);
    });
  }

  async function issueOtp(client, pending, time) {
      let issuance = otpCrypto.issue(pending.phone, pending.id);
      // Yangi nonce bilan oldingi olti xonali kod tasodifan qayta berilmasin.
      while (otpCrypto.matches(pending, issuance.code)) issuance = otpCrypto.issue(pending.phone, pending.id);
      const otpExpiresAt = new Date(time.getTime() + OTP_TTL);
      // A successful resend never leaves OTP expiry beyond the session CHECK.
      const sessionExpiresAt = new Date(Math.max(new Date(pending.session_expires_at).getTime(), otpExpiresAt.getTime()));
      await invalidate(client, pending.phone, time, "superseded");
      await client.query(
        `UPDATE pending_registrations SET otp_hmac_hash=$2,otp_hmac_key_id=$3,
         otp_issuance_nonce=$4,otp_sent_at=$5,otp_expires_at=$6,session_expires_at=$7,updated_at=$5 WHERE id=$1`,
        [pending.id, issuance.hash, issuance.keyId, issuance.nonce, time, otpExpiresAt, sessionExpiresAt],
      );
      await recordSend(client, pending, issuance, time);
      return sent(200, issuance, time, { sessionExpiresAt });
  }

  async function status(input) {
    return withSession(input, async (client, pending, limit, time) => {
      if (new Date(pending.session_expires_at).getTime() <= time.getTime() && !pending.phone_verified_at) throw invalidSession();
      const state = telegram && await telegram.state(client, pending.id);
      const waiting = !!telegram && !state?.delivered_at;
      return response(200, "Tasdiqlash holati", "registration_status", {
        deliveryPending: waiting, sessionExpiresAt: pending.session_expires_at,
        otpExpiresAt: waiting ? null : pending.otp_expires_at,
        ...(telegram ? cooldown(pending, time) : { resendAfter: !limit.last_sent_at ? 0 : Math.max(0, Math.ceil((new Date(limit.last_sent_at).getTime() + OTP_TTL - time.getTime()) / 1000)) }),
      });
    });
  }

  async function deliverTelegram({ registrationId, tokenHash, phone, chatId }) {
    if (!telegram) throw invalidSession();
    otpCrypto.ready(); sms.ready();
    return transaction(async client => {
      const limit = await lockLimit(client, phone);
      const pending = await lockPending(client, phone);
      if (!limit || !pending || String(pending.id) !== String(registrationId) || pending.phone_verified_at) throw invalidSession();
      const time = await now(client);
      const rejection = blocked(limit, time);
      if (rejection) return rejection;
      if (new Date(pending.session_expires_at).getTime() <= time.getTime()) throw invalidSession();
      const request = await telegram.lock(client, registrationId, tokenHash, chatId);
      if (request.delivered_at) return response(200, "Kod avval yuborilgan. Saytga qaytib kodni kiriting yoki saytdan yangi kod so‘rang.", "already_sent");
      if (pending.otp_failed_attempts >= 5) {
        await blockAttempts(client, phone, time);
        return response(423, "Telefon raqami bloklangan", "registration_blocked", { adminRequired: true });
      }
      const budget = await sendBudget(client, limit, time);
      if (budget) return budget;
      const result = await issueOtp(client, pending, time);
      await telegram.sent(client, pending.id, time);
      return result;
    });
  }

  async function blockAttempts(client, phone, time) {
    await client.query(
      `UPDATE registration_phone_limits SET blocked_at=$2,block_reason='otp_attempts',
       blocked_until='infinity'::timestamptz,updated_at=$2 WHERE phone=$1`, [phone, time],
    );
    await invalidate(client, phone, time, "otp_attempts");
    await event(client, phone, "otp_attempts_blocked", time);
  }

  async function verify(input) {
    const body = bodyObject(input);
    // Malformed submissions with a valid session also consume an attempt.
    const validCode = typeof body.otp === "string" && OTP_PATTERN.test(body.otp);
    return withSession(body, async (client, pending, limit, time) => {
      if (pending.phone_verified_at) return response(409, "Telefon allaqachon tasdiqlangan", "already_verified");
      if (new Date(pending.session_expires_at).getTime() <= time.getTime()) throw invalidSession();
      if (telegram) {
        const state = await telegram.state(client, pending.id);
        if (!state?.delivered_at) return response(409, "Avval OTP sahifasidagi bot havolasi orqali kod oling.", "otp_not_sent");
      }
      if (new Date(pending.otp_expires_at).getTime() <= time.getTime()) {
        return response(400, "OTP muddati tugagan", "otp_expired");
      }
      // Check key availability even for malformed codes; config errors are not attempts.
      const matches = otpCrypto.matches(pending, validCode ? body.otp : "invalid");
      if (!validCode || !matches) {
        const attempts = pending.otp_failed_attempts + 1;
        await client.query("UPDATE pending_registrations SET otp_failed_attempts=$2,updated_at=$3 WHERE id=$1",
          [pending.id, attempts, time]);
        await event(client, pending.phone, "otp_rejected", time);
        if (attempts >= 5) {
          await blockAttempts(client, pending.phone, time);
          return response(423, "Telefon raqami bloklangan; admin orqali oching", "registration_blocked", { adminRequired: true });
        }
        return response(400, "OTP noto'g'ri", "invalid_otp", { attemptsRemaining: 5 - attempts });
      }
      const completionExpiresAt = new Date(time.getTime() + COMPLETION_TTL);
      await client.query(
        "UPDATE pending_registrations SET phone_verified_at=$2,completion_expires_at=$3,updated_at=$2 WHERE id=$1",
        [pending.id, time, completionExpiresAt],
      );
      await client.query(
        `UPDATE registration_otp_history SET verified_at=$3
         WHERE registration_id=$1 AND issuance_nonce=$2 AND invalidated_at IS NULL`,
        [pending.id, pending.otp_issuance_nonce, time],
      );
      await event(client, pending.phone, "phone_verified", time);
      return response(200, "Telefon tasdiqlandi", "phone_verified", { completionExpiresAt });
    });
  }

  async function complete(input, _actor, headers = {}) {
    const body = bodyObject(input);
    const profileNames = names(body.firstName, body.lastName);
    if (!env.JWT_SECRET) throw fail(503, "Autentifikatsiya xizmati sozlanmagan", "auth_unavailable");
    return withSession(body, async (client, pending, limit, time) => {
      if (!pending.phone_verified_at) return response(403, "Avval telefonni tasdiqlang", "verification_required");
      if (!pending.completion_expires_at || new Date(pending.completion_expires_at).getTime() <= time.getTime()) {
        return response(410, "Account yaratish muddati tugagan", "completion_expired");
      }
      if (!["customer", "barber"].includes(pending.role)) throw fail(500, "Serverda xatolik yuz berdi", "invalid_state");
      const isBarber = pending.role === "barber";
      if (isBarber && !["barber", "cosmetolog", "stylist"].includes(pending.specialty)) {
        throw fail(500, "Serverda xatolik yuz berdi", "invalid_state");
      }
      const account = await client.query(
        "INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id,phone,role",
        [pending.phone, pending.password_hash, pending.role],
      );
      if (telegram) await telegram.bindAccount(client, pending, account.rows[0].id);
      const table = pending.role === "customer" ? "customers" : "barbers";
      const profile = await client.query(
        `INSERT INTO ${table}(user_id,first_name,last_name${isBarber ? ",specialty" : ""})
         VALUES($1,$2,$3${isBarber ? ",$4" : ""})
         RETURNING id,first_name,last_name,created_at${isBarber ? ",verification_status,specialty" : ""}`,
        [account.rows[0].id, profileNames.first, profileNames.last, ...(isBarber ? [pending.specialty] : [])],
      );
      const created = profile.rows[0];
      // Signing before COMMIT ensures signing failure cannot leave a completed account.
      const sid = await createDeviceSession(client, account.rows[0].id, headers['user-agent']);
      const token = signToken({ id: account.rows[0].id, profileId: created.id, role: pending.role,
        sessionVersion: 0, sid });
      await invalidate(client, pending.phone, time, "registration_completed");
      await client.query("DELETE FROM pending_registrations WHERE id=$1", [pending.id]);
      await event(client, pending.phone, "registration_completed", time);
      return response(201, "Muvaffaqiyatli ro'yxatdan o'tdi", "registration_completed", {
        token, [pending.role]: { ...created, phone: pending.phone },
        ...(pending.role === "barber" ? { verification_status: created.verification_status } : {}),
      });
    });
  }

  async function unblock(input, actor) {
    const body = bodyObject(input);
    if (actor?.role !== "admin" || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw fail(403, "Faqat admin uchun", "admin_required");
    }
    const phone = normalizePhone(body.phone);
    if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 500
      || /[\x00-\x1f\x7f]/.test(body.reason)) {
      throw fail(400, "Blokdan chiqarish sababi kiritilishi shart (1–500 belgi)", "invalid_reason");
    }
    return transaction(async (client) => {
      const admin = await client.query("SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE", [actor.id]);
      if (!admin.rowCount) throw fail(403, "Faol admin talab qilinadi", "admin_required");
      const limit = await lockLimit(client, phone);
      if (!limit) return response(404, "Telefon uchun registration topilmadi", "registration_not_found");
      const pending = await lockPending(client, phone);
      const time = await now(client);
      await client.query(
        `UPDATE registration_phone_limits SET send_count=0,penalty_level=0,last_sent_at=NULL,
         blocked_at=NULL,block_reason=NULL,blocked_until=NULL,admin_unblocked_at=$2,updated_at=$2 WHERE phone=$1`,
        [phone, time],
      );
      await invalidate(client, phone, time, "admin_unblocked");
      if (pending) await client.query("DELETE FROM pending_registrations WHERE id=$1", [pending.id]);
      await client.query(
        `INSERT INTO registration_admin_actions(admin_account_id,phone,action_type,occurred_at,reason)
         VALUES($1,$2,'unblock',$3,$4)`, [actor.id, phone, time, body.reason.trim()],
      );
      await event(client, phone, "admin_unblocked", time);
      return response(200, "Registration bloki olib tashlandi; yangi ro'yxatdan o'tishni boshlang", "registration_unblocked");
    });
  }

  return { start, resend, verify, complete, unblock, status, deliverTelegram };
}

module.exports = { createRegistrationService };
