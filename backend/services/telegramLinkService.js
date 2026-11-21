const crypto = require("node:crypto");
class TelegramLinkError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const failure = (status, code, message) => new TelegramLinkError(status, code, message);
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
function botConfig(env = process.env) {
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(env.TELEGRAM_BOT_USERNAME || "")) throw failure(503, "telegram_unavailable", "Telegram bot sozlanmagan.");
  return { botUrl: `https://t.me/${env.TELEGRAM_BOT_USERNAME}` };
}
function createTelegramLinkService({ pool, env = process.env }) {
  async function transaction(work) {
    const client = await pool.connect(); let broken = false;
    try {
      await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      const value = await work(client); await client.query("COMMIT"); return value;
    } catch (error) { try { await client.query("ROLLBACK"); } catch { broken = true; } throw error; }
    finally { client.release(broken); }
  }
  async function owner(client, actor) {
    if (actor?.role !== "barber" || !Number.isInteger(actor.id) || !Number.isInteger(actor.profileId)) throw failure(403, "barber_required", "Faqat barber uchun.");
    await client.query("SELECT pg_advisory_xact_lock($1)", [actor.profileId]);
    const result = await client.query("SELECT id,user_id FROM barbers WHERE id=$1 AND user_id=$2 FOR SHARE", [actor.profileId, actor.id]);
    if (result.rowCount) {
      const account = await client.query("SELECT id FROM users WHERE id=$1 AND role='barber' FOR SHARE", [actor.id]);
      if (!account.rowCount) { result.rowCount = 0; result.rows = []; }
    }
    if (result.rowCount) {
      const version = await client.query("SELECT version FROM account_session_versions WHERE user_id=$1", [actor.id]);
      result.rows[0].session_version = version.rows[0]?.version ?? 0;
    }
    if (!result.rowCount || result.rows[0].session_version !== (actor.sessionVersion ?? 0)) throw failure(401, "unauthorized", "Qayta tizimga kiring.");
    return result.rows[0];
  }
  async function start(actor) {
    const config = botConfig(env);
    return transaction(async (client) => {
      const barber = await owner(client, actor);
      if ((await client.query("SELECT chat_id FROM barber_telegram_links WHERE barber_id=$1", [barber.id])).rowCount) throw failure(409, "already_linked", "Avval mavjud Telegram bog‘lanishini uzing.");
      const token = crypto.randomBytes(32).toString("hex");
      const time = new Date((await client.query("SELECT clock_timestamp() AS now")).rows[0].now);
      const expiresAt = new Date(+time + 300000);
      await client.query(`INSERT INTO barber_telegram_link_tokens(barber_id,token_hash,created_at,expires_at,session_version)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(barber_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,
        created_at=EXCLUDED.created_at,expires_at=EXCLUDED.expires_at,session_version=EXCLUDED.session_version`,
      [barber.id, hash(token), time, expiresAt, barber.session_version]);
      return { ...config, token, expiresAt };
    });
  }
  async function status(actor) {
    return transaction(async (client) => {
      const barber = await owner(client, actor);
      const result = await client.query("SELECT linked_at FROM barber_telegram_links WHERE barber_id=$1", [barber.id]);
      return { ...botConfig(env), linked: !!result.rowCount, linkedAt: result.rows[0]?.linked_at ?? null };
    });
  }
  async function unlink(actor) {
    return transaction(async (client) => {
      const barber = await owner(client, actor);
      await client.query("DELETE FROM barber_telegram_link_tokens WHERE barber_id=$1", [barber.id]);
      await client.query("DELETE FROM barber_telegram_links WHERE barber_id=$1", [barber.id]);
      return { linked: false };
    });
  }
  // Internal bot method only. Never expose an HTTP consume/chat_id endpoint.
  async function consume(token, chatId) {
    if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) || !Number.isSafeInteger(chatId) || chatId <= 0) throw failure(400, "invalid_link", "Token yaroqsiz yoki muddati tugagan. /status orqali holatni tekshiring.");
    return transaction(async (client) => {
      const found = await client.query("SELECT barber_id FROM barber_telegram_link_tokens WHERE token_hash=$1", [hash(token)]);
      if (!found.rowCount) throw failure(400, "invalid_link", "Token yaroqsiz yoki muddati tugagan. /status orqali holatni tekshiring.");
      const barberId = found.rows[0].barber_id;
      await client.query("SELECT pg_advisory_xact_lock($1)", [barberId]);
      const barber = await client.query("SELECT id,user_id FROM barbers WHERE id=$1 FOR SHARE", [barberId]);
      if (barber.rowCount) {
        const account = await client.query("SELECT id FROM users WHERE id=$1 AND role='barber' FOR SHARE", [barber.rows[0].user_id]);
        if (!account.rowCount) { barber.rowCount = 0; barber.rows = []; }
      }
      if (barber.rowCount) {
        const version = await client.query("SELECT version FROM account_session_versions WHERE user_id=$1", [barber.rows[0].user_id]);
        barber.rows[0].session_version = version.rows[0]?.version ?? 0;
      }
      const pending = await client.query(`SELECT * FROM barber_telegram_link_tokens
        WHERE barber_id=$1 AND token_hash=$2 FOR UPDATE`, [barberId, hash(token)]);
      const time = new Date((await client.query("SELECT clock_timestamp() AS now")).rows[0].now);
      if (!barber.rowCount || !pending.rowCount || +new Date(pending.rows[0].expires_at) <= +time
        || barber.rows[0].session_version !== pending.rows[0].session_version) throw failure(400, "invalid_link", "Token yaroqsiz yoki muddati tugagan. /status orqali holatni tekshiring.");
      if ((await client.query("SELECT chat_id FROM barber_telegram_links WHERE barber_id=$1", [barberId])).rowCount) throw failure(409, "already_linked", "Barber allaqachon bog‘langan.");
      await client.query("INSERT INTO barber_telegram_links(barber_id,chat_id,linked_at) VALUES($1,$2,$3)", [barberId, String(chatId), time]);
      await client.query("DELETE FROM barber_telegram_link_tokens WHERE barber_id=$1", [barberId]);
      return { linked: true };
    });
  }
  async function chatStatus(chatId) {
    const result = await pool.query("SELECT barber_id FROM barber_telegram_links WHERE chat_id=$1", [String(chatId)]);
    return !!result.rowCount;
  }
  // Only the authenticated private Telegram chat can request its own upcoming
  // barber bookings. The caller never supplies a barber/customer identifier.
  async function chatUpcomingBookings(chatId) {
    if (!Number.isSafeInteger(chatId) || chatId <= 0) return null;
    const linked = await pool.query(
      `SELECT b.id, b.booking_time, b.status, s.name AS service_name
       FROM barber_telegram_links l
       JOIN barbers p ON p.id=l.barber_id
       JOIN users u ON u.id=p.user_id AND u.role='barber'
       JOIN bookings b ON b.barber_id=l.barber_id
       JOIN services s ON s.id=b.service_id
       WHERE l.chat_id=$1 AND b.booking_time >= NOW() - INTERVAL '2 hours'
         AND b.status IN ('pending','confirmed')
       ORDER BY b.booking_time ASC, b.id ASC LIMIT 5`, [String(chatId)]);
    // Distinguish an unlinked chat from a linked chat with an empty schedule.
    if (linked.rowCount) return linked.rows;
    return await chatStatus(chatId) ? [] : null;
  }
  return { start, status, unlink, consume, chatStatus, chatUpcomingBookings };
}
module.exports = { createTelegramLinkService, TelegramLinkError, botConfig };
