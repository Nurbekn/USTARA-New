const pool = require("../db");

async function getProfileId(userId, role, client = pool) {
  const table = role === "customer" ? "customers" : role === "barber" ? "barbers" : null;
  if (!table) return null;
  const result = await client.query(`SELECT id FROM ${table} WHERE user_id = $1`, [userId]);
  return result.rows[0]?.id ?? null;
}

async function getIdentity(id, role, profileId, client = pool) {
  const table = role === "customer" ? "customers" : role === "barber" ? "barbers" : null;
  if (!table) return null;
  if (Number.isInteger(profileId) && profileId > 0) {
    const result = await client.query(
      `SELECT profile.id
       FROM ${table} profile
       JOIN users account ON account.id = profile.user_id
       WHERE profile.id = $1 AND account.id = $2 AND account.role = $3 AND account.deactivated_at IS NULL AND account.admin_suspended_at IS NULL`,
      [profileId, id, role],
    );
    return result.rows[0]
      ? { accountId: id, profileId: result.rows[0].id }
      : null;
  }
  const result = await client.query(
    `SELECT profile.id
     FROM ${table} profile
     JOIN users account ON account.id = profile.user_id
     WHERE account.id = $1 AND account.role = $2 AND account.deactivated_at IS NULL AND account.admin_suspended_at IS NULL`,
    [id, role],
  );
  return result.rows[0]
    ? { accountId: id, profileId: result.rows[0].id }
    : null;
}

module.exports = { getProfileId, getIdentity };
