const { multiSchemaReady } = require('../services/bookingSelection');
function createBarberEarningsController(pool) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.user?.role !== 'barber') return res.status(403).json({ message: 'Faqat sartarosh uchun.' });
    try {
      if (await multiSchemaReady(pool)) {
        const result = await pool.query(`SELECT (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date::text AS day,
          COALESCE(items.names,s.name) AS service,COUNT(*)::int AS count,
          SUM(COALESCE(b.total_price,s.price))::double precision AS amount,
          bool_or(b.total_price IS NULL) AS estimated
          FROM bookings b JOIN services s ON s.id=b.service_id
          LEFT JOIN LATERAL(SELECT string_agg(service_name,' + ' ORDER BY position) AS names FROM booking_services WHERE booking_id=b.id) items ON TRUE
          WHERE b.barber_id=$1 AND b.status='completed'
            AND b.booking_time >= (((clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date-29)::timestamp AT TIME ZONE 'Asia/Tashkent')
            AND b.booking_time<=clock_timestamp()
          GROUP BY 1,2 ORDER BY 1,2`, [req.user.profileId]);
        return res.json({ basis: result.rows.some(row => row.estimated) ? 'mixed_snapshot_and_current_price' : 'booking_snapshot', estimateOnly: true, paymentVerified: false, rows: result.rows, serverNow: new Date().toISOString() });
      }
      // Eski bronlarda narx snapshoti yo‘q: hisob joriy xizmat narxiga asoslanadi.
      const result = await pool.query(`SELECT (b.booking_time AT TIME ZONE 'Asia/Tashkent')::date::text AS day,
        s.name AS service,COUNT(*)::int AS count,SUM(s.price)::double precision AS amount
        FROM bookings b JOIN services s ON s.id=b.service_id
        WHERE b.barber_id=$1 AND b.status='completed'
          AND b.booking_time >= (((clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date-29)::timestamp AT TIME ZONE 'Asia/Tashkent')
          AND b.booking_time<=clock_timestamp()
        GROUP BY 1,2 ORDER BY 1,2`, [req.user.profileId]);
      return res.json({ basis: 'current_service_price', estimateOnly: true, paymentVerified: false, rows: result.rows, serverNow: new Date().toISOString() });
    } catch { return res.status(503).json({ message: 'Daromad hisobotini yuklab bo‘lmadi.' }); }
  };
}
let controller;
module.exports = { createBarberEarningsController, get(req, res) { controller ||= createBarberEarningsController(require('../db'));return controller(req, res); } };
