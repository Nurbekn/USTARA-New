'use strict';
// Decision #140: support-case intake only. This module NEVER changes a phone,
// password, Telegram binding or session. Those require independent proof.
const crypto = require('node:crypto');
const { bodyObject, normalizePhone, fail } = require('../utils/registration');
const { createOtpRateLimit } = require('./otpRateLimit');

const HASH_RE = /^[0-9a-f]{64}$/;
const CASE_RE = /^[0-9a-f]{32}$/;
const STATES = new Set(['reviewing', 'verification_needed', 'closed']);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const outcome = (status, code, message, extra = {}) => ({ status, body: { code, message, ...extra } });

function createManualAccountRecovery({ pool, env = process.env, limit = createOtpRateLimit({ pool, env }) }) {
  async function tx(work) {
    const c = await pool.connect(); let broken = false;
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='3s'");
      await c.query("SET LOCAL statement_timeout='8s'");
      const result = await work(c);
      await c.query('COMMIT');
      return result;
    } catch (error) {
      try { await c.query('ROLLBACK'); } catch { broken = true; }
      throw error;
    } finally { c.release(broken); }
  }
  const clientIp = req => req.ip || req.socket?.remoteAddress || 'unknown';
  async function start(input, ip) {
    const phone = normalizePhone(bodyObject(input).phone);
    if (!/^\+998\d{9}$/.test(phone)) throw fail(400, 'O‘zbekiston telefon raqamini kiriting.', 'invalid_phone');
    // Both existing and unknown phones use identical budgets and response structure.
    if (!await limit('manual-recovery-ip', ip, 5, 900)
      || !await limit('manual-recovery-phone', phone, 2, 86400)) {
      return outcome(429, 'recovery_limited', 'So‘rovlar limiti tugadi. Keyinroq urinib ko‘ring.', { retryAfter: 900 });
    }
    const caseId = crypto.randomBytes(16).toString('hex');
    const ticketToken = crypto.randomBytes(32).toString('hex');
    await tx(async c => {
      const user = (await c.query("SELECT id FROM users WHERE phone=$1 AND role IN ('customer','barber')", [phone])).rows[0];
      await c.query(`INSERT INTO manual_recovery_cases
        (id,access_token_hash,phone,user_id,status,created_at,updated_at)
        VALUES($1,$2,$3,$4,'open',clock_timestamp(),clock_timestamp())`,
      [caseId, sha256(ticketToken), phone, user?.id ?? null]);
      await c.query("INSERT INTO manual_recovery_events(case_id,event_type) VALUES($1,'opened')", [caseId]);
    });
    return outcome(201, 'recovery_case_opened', 'So‘rov qabul qilindi. Tekshiruv uchun yordam xizmati bilan bog‘laning.',
      { caseId, ticketToken });
  }
  async function status(input, ip) {
    const body = bodyObject(input);
    if (!CASE_RE.test(body.caseId) || !HASH_RE.test(body.ticketToken)) {
      throw fail(400, 'So‘rov kodi noto‘g‘ri.', 'invalid_recovery_ticket');
    }
    if (!await limit('manual-recovery-status-ip', ip, 60, 600)) {
      return outcome(429, 'recovery_limited', 'Juda ko‘p tekshiruv. Keyinroq urinib ko‘ring.', { retryAfter: 600 });
    }
    const found = (await pool.query(`SELECT status,updated_at FROM manual_recovery_cases
      WHERE id=$1 AND access_token_hash=$2 AND created_at>clock_timestamp()-INTERVAL '14 days'`,
    [body.caseId, sha256(body.ticketToken)])).rows[0];
    if (!found) throw fail(404, 'So‘rov topilmadi yoki kuzatish muddati tugagan.', 'recovery_ticket_unavailable');
    return outcome(200, 'recovery_case_status', 'So‘rov holati.', { status: found.status, updatedAt: found.updated_at });
  }
  async function cases(actor) {
    if (actor?.role !== 'admin' || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw fail(403, 'Ruxsat yo‘q.', 'admin_required');
    }
    const rows = (await pool.query(`SELECT id,phone,status,created_at,updated_at
      FROM manual_recovery_cases ORDER BY created_at DESC LIMIT 100`)).rows;
    return outcome(200, 'recovery_cases', 'So‘rovlar ro‘yxati.', { cases: rows });
  }
  async function review(input, caseId, actor) {
    if (actor?.role !== 'admin' || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw fail(403, 'Ruxsat yo‘q.', 'admin_required');
    }
    const body = bodyObject(input);
    if (!CASE_RE.test(caseId)) throw fail(400, 'So‘rov raqami noto‘g‘ri.', 'invalid_recovery_case');
    if (!STATES.has(body.status)) throw fail(400, 'Noto‘g‘ri holat.', 'invalid_recovery_status');
    if (typeof body.reason !== 'string' || body.reason.trim().length < 3
      || body.reason.length > 500 || /[\x00-\x1f\x7f]/.test(body.reason)) {
      throw fail(400, 'Tekshiruv sababi (3–500 belgi) kerak.', 'invalid_reason');
    }
    return tx(async c => {
      const admin = await c.query('SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE', [actor.id]);
      if (!admin.rowCount) throw fail(403, 'Faol Admin talab qilinadi.', 'admin_required');
      const found = (await c.query('SELECT status FROM manual_recovery_cases WHERE id=$1 FOR UPDATE', [caseId])).rows[0];
      if (!found) throw fail(404, 'So‘rov topilmadi.', 'recovery_case_missing');
      if (found.status === 'closed') throw fail(409, 'Yopilgan so‘rovni o‘zgartirib bo‘lmaydi.', 'recovery_case_closed');
      if (found.status === body.status) return outcome(200, 'recovery_case_unchanged', 'Holat o‘zgarmadi.');
      await c.query('UPDATE manual_recovery_cases SET status=$2,updated_at=clock_timestamp() WHERE id=$1', [caseId, body.status]);
      await c.query(`INSERT INTO manual_recovery_events(case_id,event_type,admin_account_id,reason)
        VALUES($1,$2,$3,$4)`, [caseId, body.status, actor.id, body.reason.trim()]);
      return outcome(200, 'recovery_case_updated', 'So‘rov holati yangilandi.');
    });
  }
  return { start, status, cases, review, clientIp };
}
module.exports = { createManualAccountRecovery };
