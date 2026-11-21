'use strict';

// #134 Privacy Center, first scope: a copy of the signed-in account's own
// basic profile and booking records. No other customer's/barber's contact,
// private note, password, token or internal audit data is selected.
const MAX_BOOKINGS = 5000;
const id = n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
function createExportHandler({ connect }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    const { role, accountId, profileId } = req.user || {};
    if (!['customer', 'barber'].includes(role) || !id(accountId) || !id(profileId)) {
      return res.status(403).json({ code: 'privacy_forbidden', message: 'Profilingizga qayta kiring.' });
    }
    let client;
    let inTransaction = false;
    try {
      client = await connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      inTransaction = true;
      // Match both the authenticated account and the server-verified profile ID.
      const lookup = role === 'customer'
        ? `SELECT u.id AS account_id,u.phone,u.created_at AS joined_at,
            c.id AS profile_id,c.first_name,c.last_name,c.address,c.latitude,c.longitude,c.created_at AS profile_created_at
           FROM users u JOIN customers c ON c.user_id=u.id
           WHERE u.id=$1 AND u.role='customer' AND c.id=$2 AND u.deactivated_at IS NULL`
        : `SELECT u.id AS account_id,u.phone,u.created_at AS joined_at,
            b.id AS profile_id,b.first_name,b.last_name,b.salon_name,b.address,b.latitude,b.longitude,
            b.specialty,b.experience_years,b.bio,b.verification_status,b.created_at AS profile_created_at
           FROM users u JOIN barbers b ON b.user_id=u.id
           WHERE u.id=$1 AND u.role='barber' AND b.id=$2 AND u.deactivated_at IS NULL`;
      const owner = await client.query(lookup, [accountId, profileId]);
      if (owner.rowCount !== 1) {
        await client.query('ROLLBACK'); inTransaction = false;
        return res.status(403).json({ code: 'privacy_identity_mismatch', message: 'Profil tasdiqlanmadi.' });
      }
      // No joins to unrelated users or private per-booking notes. Other party
      // contact details are intentionally omitted from this export.
      const bookings = await client.query(
        `SELECT id,service_id,booking_time,
                duration_minutes,status,created_at
         FROM bookings WHERE ${role === 'customer' ? 'customer_id' : 'barber_id'}=$1
         ORDER BY id ASC LIMIT $2`, [profileId, MAX_BOOKINGS + 1]);
      if (bookings.rows.length > MAX_BOOKINGS) {
        await client.query('ROLLBACK'); inTransaction = false;
        return res.status(413).json({ code: 'privacy_export_too_large', message: 'Eksport hajmi katta. Yordam xizmatiga murojaat qiling.' });
      }
      await client.query('COMMIT'); inTransaction = false;
      // Explicit field whitelist prevents future SQL additions from leaking
      // secrets or data from tables that were never requested.
      const p = owner.rows[0];
      const profile = role === 'customer'
        ? { id:p.profile_id, firstName:p.first_name, lastName:p.last_name,
            address:p.address, latitude:p.latitude, longitude:p.longitude, createdAt:p.profile_created_at }
        : { id:p.profile_id, firstName:p.first_name, lastName:p.last_name,
            salonName:p.salon_name, specialty:p.specialty, address:p.address,
            latitude:p.latitude, longitude:p.longitude, experienceYears:p.experience_years,
            bio:p.bio, verificationStatus:p.verification_status, createdAt:p.profile_created_at };
      const records = bookings.rows.map(b => ({ id:b.id, serviceId:b.service_id,
        bookingTime:b.booking_time, durationMinutes:b.duration_minutes,
        status:b.status, createdAt:b.created_at }));
      return res.status(200).json({ code:'privacy_export', schemaVersion:1,
        generatedAt:new Date().toISOString(), account:{ role, phone:p.phone, joinedAt:p.joined_at },
        profile, bookings:records, included:['basic_profile','booking_metadata'],
        notIncluded:['private_messages','photos','payment_records','private_booking_notes','audit_logs'],
        disclaimer:'Bu birinchi bosqichdagi qisman eksport; barcha saqlangan ma’lumotlar to‘plami emas.' });
    } catch (error) {
      if (client && inTransaction) { try { await client.query('ROLLBACK'); } catch { /* connection may have failed */ } }
      // Do not log SQL parameters, private profile data or identifiers.
      console.error('Privacy export failed', { code:error?.code || 'internal_error' });
      return res.status(503).json({ code:'privacy_export_unavailable', message:'Eksportni hozir tayyorlab bo‘lmadi.' });
    } finally { if (client) client.release(); }
  };
}
module.exports = { createExportHandler, MAX_BOOKINGS };
