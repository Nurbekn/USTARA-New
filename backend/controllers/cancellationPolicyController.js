const pool = require('../db');
const MAX_CUTOFF = 10080; // 7 days; no fees or payments in USTARA.

function parsePolicy(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.some(key => !['cutoff_minutes', 'text'].includes(key)) || !keys.includes('cutoff_minutes')) return null;
  const cutoff = body.cutoff_minutes;
  if (cutoff !== null && (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > MAX_CUTOFF)) return null;
  if (body.text !== undefined && body.text !== null && (typeof body.text !== 'string' || body.text.trim().length > 280)) return null;
  const note = body.text == null ? null : body.text.trim();
  return { cutoff_minutes: cutoff, text: note || null };
}
function present(row) {
  return { cutoff_minutes: row.cancellation_cutoff_minutes, text: row.cancellation_policy_text || null, fee: 0 };
}
function createCancellationPolicyHandlers(database = pool) {
  async function mine(req, res) {
    if (req.user?.role !== 'barber' || !Number.isSafeInteger(req.user.profileId))
      return res.status(403).json({ code: 'forbidden', message: 'Faqat sartarosh o‘z qoidalarini boshqaradi.' });
    try {
      const result = await database.query('SELECT cancellation_cutoff_minutes,cancellation_policy_text FROM barbers WHERE id=$1', [req.user.profileId]);
      if (!result.rowCount) return res.status(404).json({ message: 'Sartarosh topilmadi' });
      res.set('Cache-Control', 'no-store');
      return res.json(present(result.rows[0]));
    } catch (error) {
      return res.status(503).json({ code: 'policy_unavailable', message: 'Bekor qilish qoidalari yuklanmadi. Migratsiyani tekshiring.' });
    }
  }
  async function update(req, res) {
    if (req.user?.role !== 'barber' || !Number.isSafeInteger(req.user.profileId))
      return res.status(403).json({ code: 'forbidden', message: 'Faqat sartarosh o‘z qoidalarini boshqaradi.' });
    const policy = parsePolicy(req.body);
    if (!policy) return res.status(400).json({ code: 'invalid_cancellation_policy', message: 'Muddat 0–10080 daqiqa yoki cheklovsiz (null), matn esa 280 belgigacha bo‘lishi kerak.' });
    try {
      const result = await database.query(`UPDATE barbers
        SET cancellation_cutoff_minutes=$1,cancellation_policy_text=$2
        WHERE id=$3 RETURNING cancellation_cutoff_minutes,cancellation_policy_text`,
        [policy.cutoff_minutes,policy.text,req.user.profileId]);
      if (!result.rowCount) return res.status(404).json({ message: 'Sartarosh topilmadi' });
      res.set('Cache-Control', 'no-store');
      return res.json(present(result.rows[0]));
    } catch (error) {
      return res.status(503).json({ code: 'policy_unavailable', message: 'Qoidalar saqlanmadi. Migratsiyani tekshiring.' });
    }
  }
  async function publicRead(req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(404).json({ message: 'Sartarosh topilmadi' });
    try {
      const result = await database.query(`SELECT b.cancellation_cutoff_minutes,b.cancellation_policy_text
        FROM barbers b JOIN users u ON u.id=b.user_id AND u.role='barber' AND u.deactivated_at IS NULL
        WHERE b.id=$1 AND b.verification_status='approved'`, [id]);
      if (!result.rowCount) return res.status(404).json({ message: 'Sartarosh topilmadi' });
      res.set('Cache-Control', 'no-store');
      return res.json(present(result.rows[0]));
    } catch {
      return res.status(503).json({ code: 'policy_unavailable', message: 'Qoidalar hozircha yuklanmadi.' });
    }
  }
  return { mine, update, publicRead };
}
module.exports = { createCancellationPolicyHandlers, parsePolicy };
