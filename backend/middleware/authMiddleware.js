const jwt = require("jsonwebtoken");
const pool = require("../db");
const { getIdentity } = require("./accountIdentity");
const { validSessionId } = require("../services/deviceSessions");

// JWT tokenni tekshirish. The injectable form uses the identical production rules
// and lets isolated integration tests use ONLY their disposable PostgreSQL pool.
function createAuthMiddleware({ dbPool = pool, resolveIdentity = getIdentity } = {}) {
return async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== "string" || !/^Bearer [A-Za-z0-9._-]+$/.test(authHeader)) {
    return res.status(401).json({
      message: "Token yuborilmagan",
    });
  }
  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    return res.status(401).json({
      message: "Token noto'g'ri yoki muddati tugagan",
    });
  }

  if (
    !Number.isInteger(decoded.id) ||
    decoded.id <= 0 ||
    !["customer", "barber", "admin"].includes(decoded.role)
  ) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (decoded.role === "admin") {
    try {
      const result = await dbPool.query(
        "SELECT id FROM admin_accounts WHERE id = $1 AND is_active = TRUE",
        [decoded.id],
      );
      if (result.rowCount === 0) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      req.user = decoded;
    } catch (error) {
      console.error("Admin autentifikatsiyasi paytida DB xatosi:", error.message);
      return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
    }
  } else if (decoded.role === "customer" || decoded.role === "barber") {
    let identity;
    try {
      const presented = decoded.sessionVersion ?? 0;
      if (!Number.isInteger(presented) || presented < 0) return res.status(401).json({ message: "Unauthorized" });
      identity = await resolveIdentity(decoded.id, decoded.role, decoded.profileId, dbPool);
      if (identity && decoded.sid !== undefined) {
        if (!validSessionId(decoded.sid)) return res.status(401).json({ message: 'Unauthorized' });
        const record = await dbPool.query(`SELECT 1 FROM account_device_sessions
          WHERE session_id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
          [decoded.sid, decoded.id]);
        if (!record.rowCount) identity = null;
      }
      if (identity) {
        const version = await dbPool.query("SELECT version FROM account_session_versions WHERE user_id=$1", [decoded.id]);
        if ((version.rows[0]?.version ?? 0) !== presented) identity = null;
      }
    } catch (error) {
      console.error("Autentifikatsiya paytida DB xatosi:", error.message);
      return res.status(500).json({ message: "Serverda xatolik yuz berdi" });
    }
    if (!identity) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Keep JWT identity in id; profile tables retain their independent IDs.
    req.user = { ...decoded, ...identity, profileId: identity.profileId };
  } else {
    req.user = decoded;
  }

  return next();
};
}
const authMiddleware = createAuthMiddleware();
module.exports = authMiddleware;
module.exports.createAuthMiddleware = createAuthMiddleware;
