'use strict';
// #101: A late-arrival NOTICE is not a booking reschedule or a barber acceptance.
// Serialized with booking status changes; repeated identical posts are idempotent.
const MAX_ID = 2147483647;
const ALLOWED_MINUTES = new Set([5, 10, 15, 20, 30]);
function idOf(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= MAX_ID ? n : null;
}
function payload(minutes, createdAt, replayed = false) {
  return { minutes, reportedAt: new Date(createdAt).toISOString(), replayed,
    note: 'Kechikish xabari saqlandi. Bron vaqti o‘zgarmadi; sartarosh roziligi kafolatlanmaydi.' };
}
function createHandler({ connect }) {
  return async function postLateNotice(req, res) {
    res.set?.('Cache-Control', 'no-store');
    if (req.user?.role !== 'customer' || !Number.isSafeInteger(req.user?.profileId)
        || req.user.profileId < 1 || req.user.profileId > MAX_ID)
      return res.status(403).json({ code:'forbidden', message:'Faqat o‘z broni uchun mijoz xabar yubora oladi.' });
    const id = idOf(req.params?.id);
    if (!id || !req.body || Object.keys(req.body).length !== 1 || !ALLOWED_MINUTES.has(req.body.minutes))
      return res.status(400).json({ code:'bad_request', message:'5, 10, 15, 20 yoki 30 daqiqani tanlang.' });
    let client, commitStarted = false, badConnection = false;
    try {
      client = await connect();
      await client.query('BEGIN');
      const found = await client.query(`SELECT id,status,booking_time FROM bookings
        WHERE id=$1 AND customer_id=$2 FOR UPDATE`, [id,req.user.profileId]);
      if (!found.rowCount) {
        await client.query('ROLLBACK'); return res.status(404).json({ code:'not_found', message:'Bron topilmadi.' });
      }
      const booking = found.rows[0];
      if (!['pending','confirmed'].includes(booking.status)) {
        await client.query('ROLLBACK'); return res.status(409).json({code:'inactive_booking',message:'Bron endi faol emas.'});
      }
      const existing = await client.query('SELECT minutes_late,created_at FROM booking_late_notices WHERE booking_id=$1',[id]);
      if (existing.rowCount) {
        if (Number(existing.rows[0].minutes_late) !== req.body.minutes) {
          await client.query('ROLLBACK'); return res.status(409).json({code:'notice_exists',message:'Kechikish xabari yuborilgan. Yangi xabar o‘rniga sartaroshga murojaat qiling.'});
        }
        commitStarted = true;
        await client.query('COMMIT');
        return res.status(200).json(payload(req.body.minutes, existing.rows[0].created_at, true));
      }
      // Database clock is authoritative: no browser clock, client timezone or user-supplied timestamps.
      const clock = await client.query('SELECT clock_timestamp() AS now');
      const start = new Date(booking.booking_time).getTime();
      const now = new Date(clock.rows[0]?.now).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(now) || now < start - 2*60*60000 || now > start + 10*60000) {
        await client.query('ROLLBACK'); return res.status(409).json({code:'outside_window',message:'Kechikish faqat bron boshlanishidan 2 soat avval yoki boshlanganidan keyingi 10 daqiqada xabar qilinadi.'});
      }
      const saved = await client.query(`INSERT INTO booking_late_notices (booking_id, minutes_late)
        VALUES ($1,$2) RETURNING minutes_late,created_at`,[id,req.body.minutes]);
      if (saved.rowCount !== 1) throw Error('late_notice_not_saved');
      commitStarted = true;
      await client.query('COMMIT');
      return res.status(201).json(payload(Number(saved.rows[0].minutes_late),saved.rows[0].created_at));
    } catch (error) {
      if (commitStarted) badConnection = true;
      if (client && !commitStarted) { try { await client.query('ROLLBACK'); } catch { badConnection = true; } }
      // Unknown COMMIT outcome must never be reported as a confirmed new notice.
      console.error('Late notice failed', { code: error.code || 'unavailable' });
      return res.status(503).json({code:'late_notice_unknown',message:'Xabar holati noma’lum. Qayta yuborishdan avval bronni yangilang.'});
    } finally { client?.release(badConnection); }
  };
}
module.exports={createHandler,idOf,ALLOWED_MINUTES};
