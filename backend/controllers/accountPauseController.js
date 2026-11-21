// Decision #135: a reversible account pause. Never discard booked visits.
// The shared login limiter serializes password attempts and the transaction;
// no API accepts a new phone or an arbitrary target account id here.
const { verifyPassword } = require('../utils/passwordPolicy');
const { createLoginProtection, clientIp, sendLogin } = require('../services/loginProtection');

function createAccountPauseController({ pool, protect = createLoginProtection(pool) }) {
  return {
    async deactivate(req, res) {
      res.set('Cache-Control', 'no-store');
      const { role, accountId, sessionVersion = 0 } = req.user || {};
      if (!['customer', 'barber'].includes(role) || !Number.isSafeInteger(accountId) || accountId <= 0 ||
          !Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
        return res.status(403).json({ code: 'forbidden', message: 'Akkauntni faolsizlantirish uchun ruxsat yo‘q.' });
      }
      if (typeof req.body?.password !== 'string' || !req.body.password.trim() || req.body.password.length > 1024) {
        return res.status(400).json({ code: 'password_required', message: 'Tasdiqlash uchun parolni kiriting.' });
      }
      try {
        const result = await protect({scope: 'public', account: `pause:${accountId}`, ip: clientIp(req)}, async client => {
          if (role === 'barber') {
            // Creation holds a SHARE lock on this row. Taking UPDATE before
            // the users lock serializes deactivation with in-flight bookings.
            const locked = await client.query('SELECT id FROM barbers WHERE user_id=$1 FOR UPDATE', [accountId]);
            if (!locked.rowCount) return { status: 401, outcome: 'neutral', body: {
              code: 'invalid_session', message: 'Qayta tizimga kiring.' } };
          }
          const userResult = await client.query(
            'SELECT id,role,password,deactivated_at FROM users WHERE id=$1 AND role=$2 FOR UPDATE',
            [accountId, role],
          );
          const user = userResult.rows[0];
          if (!user || user.deactivated_at != null) return {
            status: 401, outcome: 'neutral', body: { code: 'invalid_session', message: 'Qayta tizimga kiring.' },
          };
          if (!(await verifyPassword(req.body.password, user.password))) return {
            status: 401, outcome: 'failure', body: { code: 'invalid_credentials', message: 'Parol noto‘g‘ri.' },
          };
          // A confirmed or pending booking could still be in progress, so check
          // the END of its reserved interval rather than only the start time.
          const table = role === 'customer' ? 'customers' : 'barbers';
          const fk = role === 'customer' ? 'customer_id' : 'barber_id';
          const active = await client.query(`SELECT b.id FROM bookings b JOIN ${table} p ON p.id=b.${fk}
            WHERE p.user_id=$1 AND b.status IN ('pending','confirmed')
              AND b.booking_time+b.duration_minutes*INTERVAL '1 minute'>clock_timestamp()
            LIMIT 1`, [accountId]);
          if (active.rowCount) return {
            status: 409, outcome: 'neutral', body: { code: 'active_bookings',
              message: 'Faol yoki kelajakdagi bronlar mavjud. Avval ularni kelishilgan tartibda hal qiling.' },
          };
          // Compare-and-increment prevents an older session from closing a
          // newer session or racing a password/phone-change reset.
          const bumped = await client.query(`INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
             ON CONFLICT(user_id) DO UPDATE SET version=account_session_versions.version+1
             WHERE account_session_versions.version=$2 RETURNING version`, [accountId,sessionVersion]);
          if (!bumped.rowCount) return {
            status: 401, outcome: 'neutral', body: { code: 'invalid_session', message: 'Qayta tizimga kiring.' },
          };
          await client.query('UPDATE users SET deactivated_at=clock_timestamp() WHERE id=$1 AND deactivated_at IS NULL', [accountId]);
          return { status: 200, outcome: 'success', body: { code: 'account_deactivated',
            message: 'Akkaunt vaqtincha faolsizlantirildi. Qayta kirishda faollashtirishingiz mumkin.' } };
        });
        return sendLogin(res, result);
      } catch {
        return res.status(503).json({ code: 'account_pause_unavailable', message: 'Hozircha akkauntni faolsizlantirib bo‘lmadi.' });
      }
    },
  };
}
let controller;
module.exports = { createAccountPauseController, deactivate(req,res) {
  controller ||= createAccountPauseController({pool: require('../db')});
  return controller.deactivate(req,res);
} };
