const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { createDeviceSession } = require("./deviceSessions");
const { verifyPassword } = require("../utils/passwordPolicy");
const { normalizePhone } = require("../utils/registration");
const { createLoginProtection, clientIp, sendLogin } = require("./loginProtection");

// Comparable password work for unknown phones; never a usable account password.
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10);
const invalid = (admin = false, outcome = "failure") => ({ status: 401, outcome,
  body: { message: admin ? "Login yoki parol noto'g'ri" : "Telefon raqami yoki parol noto'g'ri" } });
const validBody = (body) => body && typeof body === "object" && !Array.isArray(body)
  && typeof body.password === "string" && body.password.trim() && body.password.length <= 1024;
const unavailable = (res) => sendLogin(res, { status: 503,
  body: { message: "Kirish xizmati vaqtincha ishlamayapti. Keyinroq urinib ko'ring.", code: "login_unavailable" } });

function createRoleLogin(role, pool) {
  if (![null, "customer", "barber"].includes(role)) throw new Error("Invalid login role");
  const protect = createLoginProtection(pool);
  const table = role === "customer" ? "customers" : "barbers";
  return async (req, res) => {
    if (!validBody(req.body) || typeof req.body.phone !== "string") {
      return sendLogin(res, { status: 400, body: { message: "Telefon va parolni to'g'ri kiriting" } });
    }
    let phone;
    try { phone = normalizePhone(req.body.phone); } catch {
      return sendLogin(res, { status: 400, body: { message: "Telefon va parolni to'g'ri kiriting" } });
    }
    try {
      const result = await protect({ scope: "public", account: phone, ip: clientIp(req) }, async (client) => {
        // LEFT JOIN retains the real password for the other role. The shared
        // frontend's role discovery must not count a correct barber password
        // sent first to /customers/login as an attack (and vice versa).
        const selected = await client.query(role === null
          ? `SELECT u.id AS user_id,u.role,u.phone,u.password,u.deactivated_at,COALESCE(sv.version,0) AS session_version,
             CASE WHEN u.role='customer' THEN c.id ELSE b.id END AS id,
             CASE WHEN u.role='customer' THEN c.first_name ELSE b.first_name END AS first_name,
             CASE WHEN u.role='customer' THEN c.last_name ELSE b.last_name END AS last_name,
             b.verification_status,b.specialty
             FROM users u LEFT JOIN customers c ON c.user_id=u.id AND u.role='customer'
             LEFT JOIN barbers b ON b.user_id=u.id AND u.role='barber'
             LEFT JOIN account_session_versions sv ON sv.user_id=u.id WHERE u.phone=$1`
          :
          `SELECT u.id AS user_id,u.role,u.phone,u.password,u.deactivated_at,COALESCE(sv.version,0) AS session_version,p.id,p.first_name,p.last_name${role === "barber" ? ",p.verification_status,p.specialty" : ""}
           FROM users u LEFT JOIN ${table} p ON p.user_id=u.id
           LEFT JOIN account_session_versions sv ON sv.user_id=u.id WHERE u.phone=$1`, [phone]);
        const user = selected.rows[0];
        const matches = await verifyPassword(req.body.password, user?.password || dummyHash);
        if (!user || !matches) return invalid();
        if (!["customer", "barber"].includes(user.role) || (role !== null && user.role !== role) || !user.id) return invalid(false, "neutral");
        // Serialize with Admin suspension; login must not create a fresh session
        // after suspension has committed. Suspended users cannot self-reactivate.
        const suspension = await client.query(
          'SELECT admin_suspended_at FROM users WHERE id=$1 FOR SHARE', [user.user_id]);
        if (!suspension.rowCount) return invalid(false,'neutral');
        if (suspension.rows[0].admin_suspended_at != null) return { status:423, outcome:'neutral',
          body:{code:'account_suspended',message:'Akkaunt Admin tomonidan vaqtincha to‘xtatilgan.'} };
        const resolvedRole = user.role;
        let sessionVersion = user.session_version ?? 0;
        if (user.deactivated_at != null) {
          // Explicit consent and a valid password are necessary to resume;
          // the shared login limiter protects this endpoint from guessing.
          if (req.body.reactivate !== true) return { status: 423, outcome: 'neutral', body: {
            code: 'account_deactivated', message: 'Akkaunt vaqtincha faolsizlantirilgan. Qayta faollashtirishni tasdiqlang.' } };
          const resumed = await client.query(`UPDATE users SET deactivated_at=NULL
            WHERE id=$1 AND role=$2 AND deactivated_at IS NOT NULL RETURNING id`, [user.user_id, resolvedRole]);
          if (!resumed.rowCount) return { status: 409, outcome: 'neutral', body: {
            code: 'reactivation_conflict', message: 'Akkaunt holati o‘zgardi. Qayta kiring.' } };
          const version = await client.query(`INSERT INTO account_session_versions(user_id,version) VALUES($1,1)
            ON CONFLICT(user_id) DO UPDATE SET version=account_session_versions.version+1
            RETURNING version`, [user.user_id]);
          if (!version.rowCount) throw new Error('Reactivation version unavailable');
          sessionVersion = version.rows[0].version;
        }
        const sid = await createDeviceSession(client, user.user_id, req.headers?.['user-agent']);
        const token = jwt.sign({ id: user.user_id, profileId: user.id, role: user.role, sessionVersion, sid },
          process.env.JWT_SECRET, { expiresIn: "7d" });
        return { status: 200, outcome: "success", body: { message: "Tizimga muvaffaqiyatli kirildi", token,
          ...(resolvedRole === "barber" ? { verification_status: user.verification_status } : {}),
          [resolvedRole]: { id: user.id, first_name: user.first_name, last_name: user.last_name, phone: user.phone,
            ...(resolvedRole === "barber" ? { specialty: user.specialty } : {}) } } };
      });
      return sendLogin(res, result);
    } catch {
      // Never log credentials, database errors containing bound values or JWTs.
      // Protection failures fail closed, without changing OTP/admin block state.
      return unavailable(res);
    }
  };
}

function equalSecret(value, expected) {
  const hash = (text) => crypto.createHash("sha256").update(text).digest();
  return crypto.timingSafeEqual(hash(value), hash(expected));
}
function createAdminLogin(pool, env = process.env) {
  const protect = createLoginProtection(pool);
  return async (req, res) => {
    if (!validBody(req.body) || typeof req.body.login !== "string" || !req.body.login.trim() || req.body.login.length > 128) {
      return sendLogin(res, { status: 400, body: { message: "Login va parol kiritilishi shart" } });
    }
    if (!env.ADMIN_LOGIN || !env.ADMIN_PASSWORD || !env.JWT_SECRET) return unavailable(res);
    try {
      const result = await protect({ scope: "admin", account: "singleton-admin", ip: clientIp(req) }, async (client) => {
        // Evaluate both comparisons; the existing environment-based login remains.
        const loginMatches = equalSecret(req.body.login, env.ADMIN_LOGIN);
        const passwordMatches = equalSecret(req.body.password, env.ADMIN_PASSWORD);
        if (!loginMatches || !passwordMatches) return invalid(true);
        const admin = await client.query("SELECT id FROM admin_accounts WHERE id = 1 AND is_active = TRUE");
        if (!admin.rowCount) return invalid(true);
        const token = jwt.sign({ role: "admin", id: admin.rows[0].id }, env.JWT_SECRET, { expiresIn: "2h" });
        return { status: 200, outcome: "success", body: { message: "Admin tizimga muvaffaqiyatli kirdi", token, role: "admin" } };
      });
      return sendLogin(res, result);
    } catch { return unavailable(res); }
  };
}
module.exports = { createRoleLogin, createAdminLogin };
