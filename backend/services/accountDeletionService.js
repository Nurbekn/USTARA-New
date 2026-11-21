const { createHash } = require("node:crypto");

class AccountDeletionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code, message) => new AccountDeletionError(status, code, message);
const accountHash = (phone) => createHash("sha256").update(phone).digest("hex");

function createAccountDeletionService(pool) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required");

  async function deleteAccount({ actor, profileId, role }) {
    if (actor?.role !== "admin") throw fail(403, "admin_required", "Faqat admin uchun");
    if (!Number.isInteger(profileId) || profileId <= 0 || !["customer", "barber"].includes(role)) {
      throw fail(400, "invalid_target", "Account yoki profil ID noto'g'ri");
    }

    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      const activeAdmin = await client.query("SELECT id FROM admin_accounts WHERE id=$1 AND is_active=TRUE FOR SHARE", [actor.id]);
      if (!activeAdmin.rowCount) throw fail(403, "admin_inactive", "Admin faol emas yoki ruxsat yo'q");

      // Phone limit locks precede account locks, matching registration/reset flows.
      // The first read is only used to discover the immutable canonical phone.
      const targetSql = role === "customer"
        ? `SELECT u.id AS user_id,u.phone FROM customers p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND u.role='customer'`
        : `SELECT u.id AS user_id,u.phone FROM barbers p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND u.role='barber'`;
      const initial = await client.query(targetSql, [profileId]);
      if (!initial.rowCount) throw fail(404, "account_not_found", role === "customer" ? "Mijoz topilmadi" : "Sartarosh topilmadi");
      const { user_id: userId, phone } = initial.rows[0];

      await client.query("INSERT INTO registration_phone_limits(phone) VALUES($1) ON CONFLICT(phone) DO NOTHING", [phone]);
      await client.query("SELECT phone FROM registration_phone_limits WHERE phone=$1 FOR UPDATE", [phone]);
      await client.query("INSERT INTO password_reset_limits(phone) VALUES($1) ON CONFLICT(phone) DO NOTHING", [phone]);
      await client.query("SELECT phone FROM password_reset_limits WHERE phone=$1 FOR UPDATE", [phone]);

      if (role === "barber") await client.query("SELECT pg_advisory_xact_lock($1)", [profileId]);

      // Lock profile before account to match the existing Telegram/profile writer order.
      const profileTable = role === "customer" ? "customers" : "barbers";
      const lockedProfile = await client.query(`SELECT id,user_id FROM ${profileTable} WHERE id=$1 FOR UPDATE`, [profileId]);
      const lockedUser = await client.query("SELECT id,phone,role FROM users WHERE id=$1 FOR UPDATE", [userId]);
      if (!lockedProfile.rowCount || !lockedUser.rowCount
        || lockedProfile.rows[0].user_id !== userId
        || lockedUser.rows[0].phone !== phone
        || lockedUser.rows[0].role !== role) {
        throw fail(404, "account_not_found", "Account o'chirish vaqtida o'zgardi yoki topilmadi");
      }

      // Preserve the pre-existing structural integrity validation first.
      if (role === 'barber') {
        const mismatches = await client.query(`
          SELECT b.id
          FROM bookings b
          JOIN services s ON s.id=b.service_id
          WHERE (b.barber_id=$1 AND s.barber_id<>$1)
             OR (s.barber_id=$1 AND b.barber_id<>$1)
          LIMIT 1`, [profileId]);
        if (mismatches.rowCount) {
          throw fail(409, "booking_service_ownership_mismatch", "Sartarosh bronlari va xizmatlari mos emas; o'chirish bekor qilindi");
        }
      }

      // v186: Deleting an account must never silently erase an unfinished visit.
      // This check runs AFTER the profile/user write locks (and the barber advisory
      // lock), so it serializes against the booking writers that share those locks.
      // The preview endpoint is informative only; this in-transaction guard is
      // authoritative even if bookings changed after the preview.
      const activeBookingSql = role === "customer"
        ? `SELECT id FROM bookings WHERE customer_id=$1 AND status IN ('pending','confirmed')
           AND booking_time + duration_minutes * INTERVAL '1 minute' > clock_timestamp() LIMIT 1`
        : `SELECT id FROM bookings WHERE barber_id=$1 AND status IN ('pending','confirmed')
           AND booking_time + duration_minutes * INTERVAL '1 minute' > clock_timestamp() LIMIT 1`;
      const unresolved = await client.query(activeBookingSql, [profileId]);
      if (unresolved.rowCount) {
        throw fail(409, 'active_bookings',
          'Faol yoki kelajakdagi bronlar mavjud. Ularni mijoz bilan kelishib hal qiling; hisob o‘chirilmadi.');
      }

      if (role === 'customer') {
        await client.query("DELETE FROM bookings WHERE customer_id=$1", [profileId]);
      } else {
        await client.query("DELETE FROM bookings WHERE barber_id=$1", [profileId]);
      }

      // Erase every record keyed by this account's canonical phone. Actor IDs in
      // admin action/event rows remain references to their admin_accounts rows.
      await client.query("DELETE FROM pending_registrations WHERE phone=$1", [phone]);
      await client.query("DELETE FROM registration_otp_history WHERE phone=$1", [phone]);
      await client.query("DELETE FROM registration_security_events WHERE phone=$1", [phone]);
      await client.query("DELETE FROM registration_admin_actions WHERE phone=$1", [phone]);
      await client.query("DELETE FROM password_reset_requests WHERE phone=$1 OR user_id=$2", [phone, userId]);
      await client.query("DELETE FROM password_reset_events WHERE phone=$1", [phone]);
      await client.query("DELETE FROM login_attempt_limits WHERE scope='public' AND kind='account' AND key_hash=$1", [accountHash(phone)]);
      await client.query("DELETE FROM registration_phone_limits WHERE phone=$1", [phone]);
      await client.query("DELETE FROM password_reset_limits WHERE phone=$1", [phone]);

      const deleted = await client.query("DELETE FROM users WHERE id=$1 AND role=$2 RETURNING id", [userId, role]);
      if (!deleted.rowCount) throw fail(404, "account_not_found", "Account o'chirish vaqtida topilmadi");

      await client.query("COMMIT");
      return { userId, profileId, role };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  return { deleteAccount };
}

module.exports = { AccountDeletionError, createAccountDeletionService };
