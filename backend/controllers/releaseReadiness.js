'use strict';

// Non-mutating deployment check. This is intentionally separate from /api/health:
// a successful SELECT NOW() does not prove the registration/booking schema exists.
const REQUIRED_RELATIONS = Object.freeze([
  'public.ustara_schema_migrations',
  'public.users',
  'public.customers',
  'public.barbers',
  'public.services',
  'public.barber_working_hours',
  'public.bookings',
  'public.booking_services',
  'public.booking_request_keys',
  'public.pending_registrations',
  'public.account_session_versions',
  'public.telegram_otp_contacts',
  'public.telegram_webhook_receipts',
  'public.walkin_queue',
  'public.walkin_qr_tokens',
]);

const SQL = `SELECT COALESCE(bool_and(pg_catalog.to_regclass(required.name) IS NOT NULL), false) AS ready
FROM unnest($1::text[]) AS required(name)`;

function createReleaseReadiness({ pool }) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Database pool required');
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const result = await pool.query({
        text: SQL,
        values: [REQUIRED_RELATIONS],
        query_timeout: 5000,
      });
      if (result.rows?.[0]?.ready === true) return res.status(200).json({status: 'ready'});
    } catch {
      // Do not leak SQL errors, database hosts, credentials or schema names.
    }
    return res.status(503).json({status: 'not_ready'});
  };
}

module.exports = { createReleaseReadiness, REQUIRED_RELATIONS, SQL };
