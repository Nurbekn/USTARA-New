const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createHash } = require("node:crypto");
const { createTelegramLinkService } = require("../services/telegramLinkService");
const { createTelegramController } = require("../controllers/telegramController");
const { createUpdateHandler } = require("../telegram/handler");
const { createTelegramApi, TelegramApiError } = require("../telegram/api");
const { runWorker } = require("../telegram/worker");
const env = { TELEGRAM_BOT_USERNAME: "ustara_test_bot", TELEGRAM_BOT_TOKEN: "123:" + "x".repeat(30) };
const actor = { id: 10, profileId: 1, role: "barber" };
const second = { id: 20, profileId: 2, role: "barber" };
function fixture() {
  let state = { tokens: [], links: [], barbers: [{ id: 1, user_id: 10, session_version: 0 }, { id: 2, user_id: 20, session_version: 0 }] };
  let time = new Date("2030-01-01T00:00:00Z"), tail = Promise.resolve();
  const rows = (value) => ({ rows: structuredClone(value), rowCount: value.length });
  function execute(s, q, a) {
    if (q.startsWith("SET LOCAL")) return rows([]);
    if (q.startsWith("SELECT pg_advisory_xact_lock")) return rows([]);
    if (q.startsWith("SELECT clock")) return rows([{ now: time }]);
    if (q.startsWith("SELECT id,user_id FROM barbers")) return rows(s.barbers.filter((b) => b.id === a[0] && (a.length === 1 || b.user_id === a[1])));
    if (q.startsWith("SELECT id FROM users WHERE id=$1 AND role='barber'")) return rows(s.barbers.filter((b) => b.user_id === a[0]).map((b) => ({ id: b.user_id })));
    if (q.startsWith("SELECT version FROM account_session_versions")) return rows(s.barbers.filter((b) => b.user_id === a[0]).map((b) => ({ version: b.session_version })));
    if (q.startsWith("SELECT chat_id FROM barber_telegram_links") || q.startsWith("SELECT linked_at")) return rows(s.links.filter((l) => l.barber_id === a[0]));
    if (q.startsWith("SELECT barber_id FROM barber_telegram_links")) return rows(s.links.filter((l) => l.chat_id === a[0]));
    if (q.startsWith("SELECT barber_id FROM barber_telegram_link_tokens")) return rows(s.tokens.filter((t) => t.token_hash === a[0]));
    if (q.startsWith("SELECT * FROM barber_telegram_link_tokens")) return rows(s.tokens.filter((t) => t.barber_id === a[0] && t.token_hash === a[1]));
    if (q.startsWith("INSERT INTO barber_telegram_link_tokens")) {
      s.tokens = s.tokens.filter((t) => t.barber_id !== a[0]);
      s.tokens.push({ barber_id: a[0], token_hash: a[1], created_at: a[2], expires_at: a[3], session_version: a[4] }); return rows([]);
    }
    if (q.startsWith("INSERT INTO barber_telegram_links")) {
      if (s.links.some((l) => l.chat_id === a[1] || l.barber_id === a[0])) { const error = new Error("unique"); error.code = "23505"; throw error; }
      s.links.push({ barber_id: a[0], chat_id: a[1], linked_at: a[2] }); return rows([]);
    }
    if (q.startsWith("DELETE FROM barber_telegram_link_tokens")) { s.tokens = s.tokens.filter((t) => t.barber_id !== a[0]); return rows([]); }
    if (q.startsWith("DELETE FROM barber_telegram_links")) { s.links = s.links.filter((l) => l.barber_id !== a[0]); return rows([]); }
    throw Error("unexpected mock SQL");
  }
  const pool = { get state() { return state; }, fault: null,
    async query(sql, args) { return execute(state, sql, args); },
    async connect() {
      let local, unlock, ended = false;
      return { release() { assert.ok(ended); }, async query(sql, args = []) {
        const q = sql.replace(/\s+/g, " ").trim();
        if (pool.fault && q.includes(pool.fault)) { pool.fault = null; throw Error("injected failure"); }
        if (q === "BEGIN") { const prior = tail; tail = new Promise((r) => { unlock = r; }); await prior; local = structuredClone(state); return rows([]); }
        if (q === "COMMIT" || q === "ROLLBACK") { if (q === "COMMIT") state = local; ended = true; unlock(); return rows([]); }
        return execute(local, q, args);
      } };
    },
  };
  return { pool, service: createTelegramLinkService({ pool, env }), advance(ms) { time = new Date(+time + ms); } };
}

test("start requires real barber ownership; token is random, hashed, five minutes, no URL payload", async () => {
  const f = fixture();
  await assert.rejects(f.service.start({ ...actor, role: "customer" }), { status: 403 });
  await assert.rejects(f.service.start({ ...actor, profileId: 2 }), { status: 401 });
  const result = await f.service.start(actor);
  assert.match(result.token, /^[0-9a-f]{64}$/); assert.equal(result.botUrl, "https://t.me/ustara_test_bot");
  assert.equal(new URL(result.botUrl).search, "");
  const row = f.pool.state.tokens[0]; assert.equal(row.token_hash, createHash("sha256").update(result.token).digest("hex"));
  assert.equal(+new Date(row.expires_at) - +new Date(row.created_at), 300000);
  assert.equal(JSON.stringify(f.pool.state).includes(result.token), false);
});

test("single use, expiry, restart and password-reset version revocation", async () => {
  const f = fixture(), old = await f.service.start(actor), fresh = await f.service.start(actor);
  await assert.rejects(f.service.consume(old.token, 100), { code: "invalid_link" });
  f.advance(300000); await assert.rejects(f.service.consume(fresh.token, 100), { code: "invalid_link" });
  const current = await f.service.start(actor); f.pool.state.barbers[0].session_version = 1;
  await assert.rejects(f.service.consume(current.token, 100), { code: "invalid_link" });
  const valid = await f.service.start({ ...actor, sessionVersion: 1 });
  assert.equal((await f.service.consume(valid.token, 100)).linked, true);
  await assert.rejects(f.service.consume(valid.token, 100), { code: "invalid_link" });
  assert.equal(await f.service.chatStatus(100), true);
});

test("one chat per barber, one barber per chat, explicit unlink before relink and pending token cancellation", async () => {
  const f = fixture(), a = await f.service.start(actor), b = await f.service.start(second);
  await f.service.consume(a.token, 100);
  await assert.rejects(f.service.consume(b.token, 100), { code: "23505" });
  assert.equal(f.pool.state.tokens.length, 1, "conflict rollback must preserve second token");
  await assert.rejects(f.service.start(actor), { code: "already_linked" });
  await f.service.unlink(actor); await f.service.consume(b.token, 100);
  const next = await f.service.start(actor); await f.service.unlink(actor);
  await assert.rejects(f.service.consume(next.token, 200), { code: "invalid_link" });
  assert.equal(f.pool.state.links[0].barber_id, 2);
});

test("parallel use has one winner under modeled serialization; commit failure rolls back link and consumption", async () => {
  const f = fixture(), { token } = await f.service.start(actor);
  const outcomes = await Promise.allSettled([100, 200].map((id) => f.service.consume(token, id)));
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1); assert.equal(f.pool.state.links.length, 1);
  const failed = fixture(), issued = await failed.service.start(actor); failed.pool.fault = "COMMIT";
  await assert.rejects(failed.service.consume(issued.token, 300));
  assert.equal(failed.pool.state.links.length, 0); assert.equal(failed.pool.state.tokens.length, 1);
});

test("bot accepts only private user updates, commands never echo token, status does not disclose barber identity", async () => {
  const f = fixture(), { token } = await f.service.start(actor), replies = [];
  const handler = createUpdateHandler({ service: f.service, username: env.TELEGRAM_BOT_USERNAME,
    api: async (method, body) => { replies.push({ method, body }); } });
  const update = (text, chat = { id: 100, type: "private" }, from = { id: 100 }) => ({ message: { text, chat, from } });
  await handler(update(`/start ${token}`, { id: -123, type: "group" }));
  await handler(update(`/start ${token}`, undefined, { id: 999 })); assert.equal(f.pool.state.links.length, 0);
  await handler(update(`/start ${token}`)); await handler(update("/status")); await handler(update("/help"));
  assert.equal(replies.length, 3); assert.equal(JSON.stringify(replies).includes(token), false);
  assert.equal(replies[1].body.text.includes("bog‘langan"), true);
  assert.equal(replies.every((r) => r.body.protect_content), true);
});

test("Telegram errors redact URL/token; controller rejects non-barber and hides internal errors", async () => {
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN, async () => { throw Error("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN); });
  await assert.rejects(api("getMe"), (error) => error instanceof TelegramApiError && !String(error.stack).includes(env.TELEGRAM_BOT_TOKEN));
  const handler = createTelegramController({ async start() { throw Error("private DB error"); } }).start;
  const res = { set() {}, status(v) { this.statusCode = v; return this; }, json(value) { this.body = value; return this; } };
  await handler({ user: { role: "customer" } }, res); assert.equal(res.statusCode, 403);
  await handler({ user: actor }, res); assert.equal(res.statusCode, 503); assert.ok(!res.body.message.includes("private"));
});

test("poller holds dedicated session lock; duplicate worker never calls getUpdates; shutdown releases connection", async () => {
  let locked = false, polling = 0, released = 0, ready;
  const entered = new Promise((r) => { ready = r; });
  const pool = { async connect() {
    const client = new EventEmitter(); let owns = false;
    client.release = () => { released++; if (owns) locked = false; };
    client.query = async (sql) => {
      if (sql.includes("pg_try_advisory_lock")) { owns = !locked; if (owns) locked = true; return { rows: [{ acquired: owns }] }; }
      if (sql.startsWith("SELECT next_update_id")) return { rows: [{ next_update_id: "0" }] };
      if (sql.includes("pg_advisory_unlock")) { locked = false; owns = false; }
      return { rows: [] };
    }; return client;
  } };
  const api = async (method, body, signal) => {
    if (method === "getMe") return { id: 123, is_bot: true, username: env.TELEGRAM_BOT_USERNAME };
    if (method === "getWebhookInfo") return { url: "" };
    if (method === "getUpdates") { assert.deepEqual(body.allowed_updates, ["message", "callback_query"]); polling++; ready(); await new Promise((r) => signal.addEventListener("abort", r, { once: true })); throw new TelegramApiError("transport"); }
    throw Error("unexpected method");
  };
  const stop = new AbortController(); const first = runWorker({ pool, env, api, signal: stop.signal });
  await entered; assert.equal(await runWorker({ pool, env, api }), false); assert.equal(polling, 1);
  stop.abort(); assert.equal(await first, true); assert.equal(locked, false); assert.equal(released, 2);
});

test("poller refuses an existing webhook and aborts on loss of its lock-owning connection", async () => {
  for (const webhook of [true, false]) {
    let client, polls = 0, destroyed = false;
    const pool = { async connect() {
      client = new EventEmitter(); client.release = (value) => { destroyed = value; };
      client.query = async (sql) => sql.includes("pg_try_advisory_lock") ? { rows: [{ acquired: true }] }
        : sql.startsWith("SELECT next_update_id") ? { rows: [{ next_update_id: "0" }] } : { rows: [] };
      return client;
    } };
    const api = async (method, body, signal) => {
      if (method === "getMe") return { id: 123, is_bot: true, username: env.TELEGRAM_BOT_USERNAME };
      if (method === "getWebhookInfo") return { url: webhook ? "https://example.invalid/hook" : "" };
      if (method === "getUpdates") { polls++; client.emit("error", Error("lost leader connection")); assert.equal(signal.aborted, true); throw new TelegramApiError("transport"); }
      throw Error("unexpected API method");
    };
    if (webhook) await assert.rejects(runWorker({ pool, env, api }), /Webhook configured/);
    else assert.equal(await runWorker({ pool, env, api }), true);
    assert.equal(polls, webhook ? 0 : 1); assert.equal(destroyed, true);
  }
});

test("booking callback API methods use JSON POST and the configured safe transport", async () => {
  const calls = [];
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN, async (url, options) => {
    calls.push({ method: url.split("/").at(-1), options }); return { ok: true, json: async () => ({ ok: true, result: true }) };
  });
  await api("answerCallbackQuery", { callback_query_id: "test-query", text: "Done" });
  await api("editMessageReplyMarkup", { chat_id: 100, message_id: 50, reply_markup: { inline_keyboard: [] } });
  assert.deepEqual(calls.map((c) => c.method), ["answerCallbackQuery", "editMessageReplyMarkup"]);
  assert.equal(calls.every((c) => c.options.method === "POST" && c.options.redirect === "error"), true);
});
