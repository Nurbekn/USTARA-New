'use strict';
// #102: a customer can request check-in; only the booking's barber confirms it.
// Neither action changes bookings.status or starts/completes a service.
const MAX_ID = 2147483647;
const EARLY_MS = 90 * 60_000;
const LATE_MS = 30 * 60_000;
function validId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= MAX_ID ? id : null;
}
function validProfile(user, role) {
  return user?.role === role && Number.isSafeInteger(user.profileId) &&
    user.profileId > 0 && user.profileId <= MAX_ID;
}
function safeResult(row, replayed = false) {
  return {
    requestedAt: new Date(row.requested_at).toISOString(),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    replayed,
    note: 'Kelganlik belgisi bronning vaqti yoki xizmat holatini o‘zgartirmaydi.',
  };
}
function makeHandler({connect}, mode) {
  const role = mode === 'request' ? 'customer' : 'barber';
  return async function checkIn(req, res) {
    res.set?.('Cache-Control', 'no-store');
    if (!validProfile(req.user, role)) return res.status(403).json({code:'forbidden',message:'Ruxsat yo‘q.'});
    const id = validId(req.params?.id);
    if (!id || (req.body != null && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)))
      return res.status(400).json({code:'bad_request',message:'Noto‘g‘ri check-in so‘rovi.'});
    let client, commitStarted = false, broken = false;
    try {
      client = await connect();
      await client.query('BEGIN');
      const ownerColumn = mode === 'request' ? 'customer_id' : 'barber_id';
      const found = await client.query(`SELECT id,status,booking_time FROM bookings
        WHERE id=$1 AND ${ownerColumn}=$2 FOR UPDATE`, [id,req.user.profileId]);
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({code:'not_found',message:'Bron topilmadi.'});
      }
      if (found.rows[0].status !== 'confirmed') {
        await client.query('ROLLBACK');
        return res.status(409).json({code:'inactive_booking',message:'Faqat tasdiqlangan faol bron uchun check-in mumkin.'});
      }
      const existing = await client.query(`SELECT requested_at,confirmed_at FROM booking_checkins WHERE booking_id=$1`,[id]);
      if (existing.rowCount) {
        if (mode === 'request' || existing.rows[0].confirmed_at) {
          commitStarted = true;
          await client.query('COMMIT');
          return res.status(200).json(safeResult(existing.rows[0],true));
        }
      } else if (mode === 'confirm') {
        await client.query('ROLLBACK');
        return res.status(409).json({code:'not_requested',message:'Mijoz hali kelganini bildirmagan.'});
      }
      let row;
      if (mode === 'request') {
        // Database time, not device time, determines whether check-in is allowed.
        const clock = await client.query('SELECT clock_timestamp() AS now');
        const now = new Date(clock.rows[0]?.now).getTime();
        const start = new Date(found.rows[0].booking_time).getTime();
        if (!Number.isFinite(now) || !Number.isFinite(start) || now < start - EARLY_MS || now > start + LATE_MS) {
          await client.query('ROLLBACK');
          return res.status(409).json({code:'outside_window',message:'Kelganlikni bron boshlanishidan 90 daqiqa avvaldan 30 daqiqa keyingacha bildirish mumkin.'});
        }
        const result = await client.query(`INSERT INTO booking_checkins (booking_id)
          VALUES ($1) RETURNING requested_at,confirmed_at`,[id]);
        if (result.rowCount !== 1) throw Error('checkin_insert_failed');
        row = result.rows[0];
      } else {
        const result = await client.query(`UPDATE booking_checkins
          SET confirmed_at=clock_timestamp(),confirmed_by_barber_id=$2
          WHERE booking_id=$1 AND confirmed_at IS NULL
          RETURNING requested_at,confirmed_at`, [id,req.user.profileId]);
        if (result.rowCount !== 1) throw Error('checkin_confirm_failed');
        row = result.rows[0];
      }
      commitStarted = true;
      await client.query('COMMIT');
      return res.status(201).json(safeResult(row));
    } catch (error) {
      if (commitStarted) broken = true;
      if (client && !commitStarted) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
      }
      console.error('Check-in operation failed', {code:error.code || 'unavailable'});
      return res.status(503).json({code:'checkin_unknown',message:'Check-in holati noma’lum. Qayta yuborishdan oldin bronni yangilang.'});
    } finally { client?.release(broken); }
  };
}
module.exports = {validId,requestHandler:deps=>makeHandler(deps,'request'),confirmHandler:deps=>makeHandler(deps,'confirm')};
