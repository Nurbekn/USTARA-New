const { createHash } = require("node:crypto");
const { isIP } = require("node:net");

const MINUTE = 60000;
const WINDOW = 15 * MINUTE;
const QUIET = 24 * 60 * MINUTE;
const ACCOUNT_DELAYS = [1, 3, 5];
const IP_DELAYS = [1, 3, 5];
const digest = (value) => createHash("sha256").update(value).digest("hex");

function clientIp(req) {
  // Direct peer only: forwarding headers are never evidence of client identity.
  // Behind a proxy, deploy the documented edge controls before changing this.
  const address = req.socket?.remoteAddress;
  if (!isIP(address || "")) throw new Error("Client address unavailable");
  if (isIP(address) === 4) return address;
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return canonical;
}

// Eski uzoq blok ham oxirgi xato va yangi jadval asosida tugaydi.
// Har bir qayta so‘rovga yana besh daqiqa qo‘shilmaydi.
function blockUntil(row) {
  if (!row.blocked_until) return null;
  const delays = row.kind === "account" ? ACCOUNT_DELAYS : IP_DELAYS;
  const minutes = delays[Math.min(Math.max(row.penalty_level - 1, 0), delays.length - 1)];
  return new Date(Math.min(+new Date(row.blocked_until), +new Date(row.last_failed_at) + minutes * MINUTE));
}

function blocked(until, time) {
  const retryAfter = Math.max(1, Math.ceil((new Date(until).getTime() - time.getTime()) / 1000));
  return { status: 429, body: { message: "Kirish vaqtincha cheklangan. Biroz kutib qayta urinib ko'ring.",
    code: "login_throttled", retryAfter } };
}

function createLoginProtection(pool) {
  return async function protect({ scope, account, ip }, authenticate) {
    if (!["public", "admin"].includes(scope) || !account || !isIP(ip)) throw new Error("Invalid limiter identity");
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const rows = [];
      // Every worker locks IP first, account second. ON CONFLICT plus FOR UPDATE
      // serializes new and existing counters across processes, before password work.
      // Public trafik umumiy NAT yoki proxy orqali kelishi mumkin. Har bir
      // telefonning source budjeti alohida; account limiti esa barcha IP
      // va public endpointlar bo‘yicha umumiy qoladi.
      const sourceKey = scope === "public" ? JSON.stringify([account, ip]) : ip;
      for (const [kind, key] of [["ip", sourceKey], ["account", account]]) {
        const keyHash = digest(key);
        await client.query(`INSERT INTO login_attempt_limits(scope,kind,key_hash)
          VALUES($1,$2,$3) ON CONFLICT(scope,kind,key_hash) DO NOTHING`, [scope, kind, keyHash]);
        const result = await client.query(`SELECT * FROM login_attempt_limits
          WHERE scope=$1 AND kind=$2 AND key_hash=$3 FOR UPDATE`, [scope, kind, keyHash]);
        const row = result.rows[0];
        row.blocked_until = blockUntil(row);
        rows.push(row);
        if (kind === "ip") {
          const checkTime = new Date((await client.query("SELECT clock_timestamp() AS time")).rows[0].time);
          if (rows[0].blocked_until && new Date(rows[0].blocked_until) > checkTime) {
            // Blocked IPs cannot allocate unlimited new account-counter rows.
            await client.query("COMMIT");
            return blocked(rows[0].blocked_until, checkTime);
          }
        }
      }
      const time = new Date((await client.query("SELECT clock_timestamp() AS time")).rows[0].time);
      const active = rows.filter((row) => row.blocked_until && new Date(row.blocked_until) > time);
      if (active.length) {
        const until = new Date(Math.max(...active.map((row) => new Date(row.blocked_until).getTime())));
        await client.query("COMMIT");
        return blocked(until, time);
      }
      // Token creation also happens before COMMIT, so an internal failure never
      // resets counters or issues an HTTP success before the durable update.
      const result = await authenticate(client);
      if (!["success", "failure", "neutral"].includes(result.outcome)) throw new Error("Invalid authentication outcome");
      let rejection;
      let responseTime = time;
      if (result.outcome === "success") {
        await client.query(`UPDATE login_attempt_limits SET failed_count=0,penalty_level=0,
          window_started_at=NULL,last_failed_at=NULL,blocked_until=NULL
          WHERE scope=$1 AND kind=$2 AND key_hash=$3`, [scope, "account", digest(account)]);
        // A shared IP is not forgiven by another user's successful login.
      } else if (result.outcome === "failure") {
        // Count at completion time: expensive password verification must not
        // shorten the new block. Database time is authoritative.
        const failedAt = new Date((await client.query("SELECT clock_timestamp() AS time")).rows[0].time);
        responseTime = failedAt;
        for (const row of rows) {
          const quiet = row.kind === "ip" && (!row.last_failed_at || failedAt - new Date(row.last_failed_at) >= QUIET);
          const expiredBlock = row.blocked_until && new Date(row.blocked_until) <= failedAt;
          const expiredWindow = row.kind === "ip" && row.window_started_at
            && failedAt - new Date(row.window_started_at) >= WINDOW;
          let count = quiet || expiredBlock || expiredWindow ? 0 : row.failed_count;
          let level = quiet ? 0 : row.penalty_level;
          let windowStart = count ? row.window_started_at : failedAt;
          let until = null;
          count += 1;
          if (count >= (row.kind === "account" ? 5 : 10)) {
            const delays = row.kind === "account" ? ACCOUNT_DELAYS : IP_DELAYS;
            until = new Date(failedAt.getTime() + delays[Math.min(level, delays.length - 1)] * MINUTE);
            level = Math.min(level + 1, delays.length);
            count = 0;
            windowStart = null;
            if (!rejection || until > rejection) rejection = until;
          }
          await client.query(`UPDATE login_attempt_limits SET failed_count=$4,penalty_level=$5,
            window_started_at=$6,last_failed_at=$7,blocked_until=$8
            WHERE scope=$1 AND kind=$2 AND key_hash=$3`,
          [scope, row.kind, row.key_hash, count, level, windowStart, failedAt, until]);
        }
      }
      await client.query("COMMIT");
      return rejection ? blocked(rejection, responseTime) : result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  };
}

function sendLogin(res, result) {
  res.set("Cache-Control", "no-store");
  if (result.status === 429) res.set("Retry-After", String(result.body.retryAfter));
  return res.status(result.status).json(result.body);
}

module.exports = { createLoginProtection, clientIp, sendLogin };
