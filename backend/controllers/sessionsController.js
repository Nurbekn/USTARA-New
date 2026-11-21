// Existing account_session_versions is shared with password reset and phone
// changes. This action revokes all previous JWTs, including the current one.
const { validSessionId } = require('../services/deviceSessions');
function allowed(req) { return ['customer','barber'].includes(req.user?.role) &&
  Number.isSafeInteger(req.user.accountId) && req.user.accountId > 0; }

function createSessionsController({ pool }) {
  return {
    async list(req, res) {
      res.set('Cache-Control', 'no-store');
      if (!allowed(req)) return res.status(403).json({code:'forbidden',message:'Ruxsat yo‘q.'});
      try {
        const records = await pool.query(`SELECT session_id,device_label,created_at,expires_at FROM account_device_sessions
          WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()
          ORDER BY created_at DESC LIMIT 20`, [req.user.accountId]);
        return res.status(200).json({code:'device_sessions',sessions:records.rows.map(row => ({
          id:row.session_id.trim(),label:row.device_label,createdAt:row.created_at,
          expiresAt:row.expires_at,current:row.session_id.trim()===req.user.sid,
        }))});
      } catch {
        return res.status(503).json({code:'sessions_unavailable',message:'Qurilmalarni ko‘rsatib bo‘lmadi.'});
      }
    },
    async revokeOne(req, res) {
      res.set('Cache-Control', 'no-store');
      if (!allowed(req)) return res.status(403).json({code:'forbidden',message:'Ruxsat yo‘q.'});
      const id = req.params?.id;
      if (!validSessionId(id)) return res.status(400).json({code:'invalid_device',message:'Noto‘g‘ri sessiya.'});
      try {
        const result = await pool.query(`UPDATE account_device_sessions
          SET revoked_at=clock_timestamp()
          WHERE session_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()
          RETURNING session_id`, [id,req.user.accountId]);
        if (!result.rowCount) return res.status(404).json({code:'session_missing',message:'Faol sessiya topilmadi.'});
        return res.status(200).json({code:'device_revoked',message:'Qurilmadan chiqildi.',current:id===req.user.sid});
      } catch {
        return res.status(503).json({code:'sessions_unavailable',message:'Sessiyani bekor qilib bo‘lmadi.'});
      }
    },
    async revokeAll(req, res) {
      res.set("Cache-Control", "no-store");
      if (!["customer", "barber"].includes(req.user?.role)) {
        return res.status(403).json({ code: "forbidden", message: "Bu amal uchun ruxsat yo‘q." });
      }
      const id = req.user.accountId;
      const version = req.user.sessionVersion ?? 0;
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(version) || version < 0) {
        return res.status(401).json({ code: "invalid_session", message: "Qayta tizimga kiring." });
      }
      try {
        // Atomic compare-and-increment: concurrent logout/password-reset calls
        // cannot make a stale JWT valid or overwrite a newer version.
        const result = await pool.query(
          `INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
           ON CONFLICT (user_id) DO UPDATE
           SET version=account_session_versions.version+1
           WHERE account_session_versions.version=$2
           RETURNING version`, [id, version],
        );
        if (!result.rowCount) return res.status(401).json({ code: "invalid_session", message: "Sessiya allaqachon bekor qilingan." });
        return res.status(200).json({ code: "sessions_revoked", message: "Barcha qurilmalardagi sessiyalar bekor qilindi." });
      } catch {
        // Never claim logout happened when PostgreSQL did not confirm it.
        return res.status(503).json({ code: "sessions_unavailable", message: "Sessiyalarni bekor qilib bo‘lmadi. Qayta urinib ko‘ring." });
      }
    },
  };
}
let controller;
module.exports = { createSessionsController, ...Object.fromEntries(['list','revokeOne','revokeAll'].map(action =>
  [action, (req,res) => { controller ||= createSessionsController({pool:require('../db')});
    return controller[action](req,res); }])) };
