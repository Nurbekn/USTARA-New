'use strict';
// #151: receipts for the requesting account only. These are not moderation decisions.
function createMyReportsHandler(db) {
  if (!db || typeof db.query !== 'function') throw new TypeError('Database query required');
  return async function myReports(req, res) {
    const accountId = req.user?.accountId;
    if (!['customer', 'barber'].includes(req.user?.role) ||
        !Number.isSafeInteger(accountId) || accountId < 1) {
      return res.status(403).json({ message: 'Shikoyatlar faqat o‘z akkauntingizda ko‘rinadi.' });
    }
    try {
      const result = await db.query(
        `SELECT id, post_id AS "postId", reason, created_at AS "createdAt"
         FROM social_reports WHERE user_id=$1
         ORDER BY created_at DESC,id DESC LIMIT 50`,
        [accountId],
      );
      res.set('Cache-Control', 'no-store');
      return res.json({ reports: result.rows, limit: 50, moderationStatusAvailable: false });
    } catch (error) {
      console.error('social_report_receipts_failed', error.code || 'internal_error');
      return res.status(503).json({ message: 'Shikoyatlaringizni yuklab bo‘lmadi.' });
    }
  };
}
module.exports = { createMyReportsHandler };
