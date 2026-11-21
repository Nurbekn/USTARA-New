/* v128 / #178 #49 #83: profile inaccuracies, reviewed without exposing reporters. */
const REASONS = new Set(['address', 'hours', 'services', 'media', 'other']);
const OUTCOMES = new Set(['resolved', 'dismissed']);
const idOf = raw => /^\d+$/.test(String(raw)) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? Number(raw) : null;
const errorResponse = (res, status, message) => res.status(status).json({message});
const REPORT_STATUSES = new Set(['all','pending','resolved','dismissed']);
const PROFILE_PENDING_REASONS = Object.freeze(['address','hours','services','media','other']);
const PUBLIC_REPORT_FIELDS = Object.freeze(['id','barber_id','reason','details','status','created_at','reviewed_at','barber_first','barber_last']);

// Reject duplicate query keys, arrays, large page numbers and untrusted SQL fragments.
function parseReportListQuery(raw = {}) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') return null;
  if (Object.keys(raw).some(key => !['status', 'page'].includes(key))) return null;
  const status = raw.status === undefined ? 'all' : raw.status;
  const pageText = raw.page === undefined ? '1' : raw.page;
  if (typeof status !== 'string' || !REPORT_STATUSES.has(status) || typeof pageText !== 'string'
      || !/^[1-9]\d{0,2}$/.test(pageText)) return null;
  const page = Number(pageText);
  if (page > 100) return null;
  return {status, page, offset: (page - 1) * 100};
}
function publicReport(row) {
  return Object.fromEntries(PUBLIC_REPORT_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(row, key))
    .map(key => [key, row[key]]));
}

function validateReport(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || !REASONS.has(body.reason) || typeof body.details !== 'string') return null;
  const details = body.details.trim();
  if (details.length < 10 || details.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(details)) return null;
  return {reason: body.reason, details};
}

function createProfileIssueHandlers(pool) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('DB pool required');
  return {
    async submit(req, res) {
      res.set('Cache-Control', 'no-store');
      if (req.user?.role !== 'customer' || !idOf(req.user?.accountId)) return errorResponse(res, 403, 'Bu amal mijoz akkaunti uchun.');
      const barberId = idOf(req.params?.id);
      const validated = validateReport(req.body);
      if (!barberId || !validated) return errorResponse(res, 400, 'Profil xatosi haqida ma’lumotlar noto‘g‘ri.');
      try {
        const result = await pool.query(`INSERT INTO profile_issue_reports (barber_id,reporter_user_id,reason,details)
          SELECT b.id,$2,$3,$4 FROM barbers b WHERE b.id=$1 AND b.verification_status='approved'
          ON CONFLICT (barber_id,reporter_user_id,reason) WHERE status='pending' DO NOTHING
          RETURNING id`, [barberId, req.user.accountId, validated.reason, validated.details]);
        if (result.rowCount === 1) return res.status(201).json({accepted: true});
        const exists = await pool.query("SELECT 1 FROM barbers WHERE id=$1 AND verification_status='approved'", [barberId]);
        if (!exists.rowCount) return errorResponse(res, 404, 'Tasdiqlangan profil topilmadi.');
        return errorResponse(res, 409, 'Bu turdagi xato haqida xabar allaqachon ko‘rib chiqilmoqda.');
      } catch (err) {
        console.error('profile_issue_submit_failed', err?.code || 'db_unavailable');
        return errorResponse(res, 503, 'Xabar saqlanmadi. Birozdan keyin qayta urinib ko‘ring.');
      }
    },
    async ownPending(req, res) {
      res.set('Cache-Control', 'no-store');
      if (req.user?.role !== 'customer' || !idOf(req.user?.accountId))
        return errorResponse(res, 403, 'Faqat mijoz o‘z xabarlarini ko‘ra oladi.');
      const barberId = idOf(req.params?.id);
      if (!barberId) return errorResponse(res, 400, 'Profil ID noto‘g‘ri.');
      try {
        const result = await pool.query(`SELECT DISTINCT r.reason
          FROM profile_issue_reports r
          WHERE r.barber_id=$1 AND r.reporter_user_id=$2 AND r.status='pending'
          ORDER BY r.reason`, [barberId, req.user.accountId]);
        // Never return report id, details, reporter identifier or any other user's records.
        const reasons = [...new Set(result.rows.map(row => row.reason))]
          .filter(reason => PROFILE_PENDING_REASONS.includes(reason));
        return res.json({pendingReasons: reasons});
      } catch (err) {
        console.error('profile_issue_own_pending_failed', err?.code || 'db_unavailable');
        return errorResponse(res, 503, 'Xabar holatini tekshirib bo‘lmadi.');
      }
    },
    async list(req, res) {
      res.set('Cache-Control', 'no-store');
      if (req.user?.role !== 'admin') return errorResponse(res, 403, 'Faqat admin uchun.');
      const filter = parseReportListQuery(req.query);
      if (!filter) return errorResponse(res, 400, 'Xabar filtri yoki sahifa noto‘g‘ri.');
      try {
        const result = await pool.query(`SELECT r.id,r.barber_id,r.reason,r.details,r.status,r.created_at,r.reviewed_at,
          b.first_name AS barber_first,b.last_name AS barber_last
          FROM profile_issue_reports r JOIN barbers b ON b.id=r.barber_id
          WHERE ($1::text='all' OR r.status=$1)
          ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END, r.created_at DESC,r.id DESC
          LIMIT 101 OFFSET $2`, [filter.status,filter.offset]);
        // Defense in depth: never return identity/phone/credential fields even if a DB adapter supplies extras.
        return res.json(result.rows.map(publicReport));
      } catch (err) {
        console.error('profile_issue_list_failed', err?.code || 'db_unavailable');
        return errorResponse(res, 503, 'Xabarlarni yuklab bo‘lmadi.');
      }
    },
    async review(req, res) {
      res.set('Cache-Control', 'no-store');
      if (req.user?.role !== 'admin' || !idOf(req.user?.id)) return errorResponse(res, 403, 'Faqat admin uchun.');
      const reportId = idOf(req.params?.id);
      const status = req.body?.status;
      if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object'
        || Object.keys(req.body).length !== 1 || !reportId || !OUTCOMES.has(status)) return errorResponse(res, 400, 'Ko‘rib chiqish natijasi noto‘g‘ri.');
      try {
        const result = await pool.query(`UPDATE profile_issue_reports SET status=$2,reviewed_at=clock_timestamp(),reviewed_by_admin_id=$3
          WHERE id=$1 AND status='pending' RETURNING id,status`, [reportId, status, req.user.id]);
        if (result.rowCount === 1) return res.json({id: Number(result.rows[0].id), status: result.rows[0].status});
        const exists = await pool.query('SELECT 1 FROM profile_issue_reports WHERE id=$1', [reportId]);
        return exists.rowCount ? errorResponse(res, 409, 'Bu xabar allaqachon ko‘rib chiqilgan.') : errorResponse(res, 404, 'Xabar topilmadi.');
      } catch (err) {
        console.error('profile_issue_review_failed', err?.code || 'db_unavailable');
        return errorResponse(res, 503, 'Ko‘rib chiqish natijasini tasdiqlab bo‘lmadi. Avval ro‘yxatni yangilang.');
      }
    },
  };
}
module.exports = {createProfileIssueHandlers, validateReport, idOf, parseReportListQuery, publicReport};
