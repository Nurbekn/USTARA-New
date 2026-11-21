// Explicit local test database only. Real HTTP, services and PostgreSQL; Telegram transport is simulated.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const express = require('express');
const { testTarget, assertTestConnection } = require('./helpers/testDatabaseTarget');
const { createRegistrationService } = require('../services/registrationService');
const { createRegistrationController } = require('../controllers/registrationController');
const { createTelegramContacts, createTelegramOtpAdapter } = require('../services/telegramOtp');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const { verifyPassword } = require('../utils/passwordPolicy');
const { sessionHash } = require('../utils/registration');
const enabled = process.env.NODE_ENV === 'test'
  && process.env.USTARA_TELEGRAM_AUTH_TESTS === 'I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('signup restart: real HTTP/PostgreSQL, no session or verification takeover', { skip: !enabled }, async t => {
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, 'Signup restart testi', ['ustara_account_test']);
  const pool = new Pool({ connectionString: process.env.USTARA_TEST_DATABASE_URL, max: 8 });
  const phones = [], deliveries = [];
  const botId = crypto.randomInt(100000000, 900000000);
  const env = { NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: botId + ':' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_booking_bot',
    OTP_HMAC_KEY: crypto.randomBytes(48).toString('hex'), JWT_SECRET: crypto.randomBytes(48).toString('hex') };
  const sms = createTelegramOtpAdapter({ pool, env, api: async (_method, body) => {
    deliveries.push({ chat: String(body.chat_id), code: /kodi: (\d{5})/.exec(body.text)[1] });
    return { message_id: deliveries.length, chat: { id: body.chat_id } };
  } });
  const service = createRegistrationService({ pool, env, sms });
  const flow = createTelegramRegistration({ pool, env, contacts: createTelegramContacts({ pool, botId }), deliver: service.deliverTelegram });
  const controller = createRegistrationController(service), app = express(); app.use(express.json());
  for (const action of ['start', 'verify', 'resend', 'status', 'complete']) app.post('/' + action, controller[action]);
  let server, verified = false;
  t.after(async () => {
    try {
      if (server) await new Promise(resolve => server.close(resolve));
      if (verified) {
        await assertTestConnection(pool, target);
        await pool.query('DELETE FROM users WHERE phone=ANY($1::text[])', [phones]);
        await pool.query('DELETE FROM telegram_otp_contacts WHERE bot_id=$1 AND phone=ANY($2::text[])', [botId, phones]);
        for (const table of ['pending_registrations', 'registration_otp_history', 'registration_security_events', 'registration_phone_limits']) {
          await pool.query(`DELETE FROM ${table} WHERE phone=ANY($1::text[])`, [phones]);
        }
      }
    } finally { await pool.end(); }
  });
  await assertTestConnection(pool, target); verified = true;
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  async function call(action, body) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }
  async function phone() {
    for (;;) {
      const p = '+998' + crypto.randomInt(900000000, 999999999);
      if (phones.includes(p)) continue;
      const used = await pool.query('SELECT phone FROM users WHERE phone=$1 UNION ALL SELECT phone FROM registration_phone_limits WHERE phone=$1 UNION ALL SELECT phone FROM telegram_otp_contacts WHERE phone=$1', [p]);
      if (!used.rowCount) { phones.push(p); return p; }
    }
  }
  const start = (p, extra = {}) => call('start', { phone: p, password: 'FirstPassword123', role: 'customer', ...extra });
  const names = { firstName: 'Sinov', lastName: 'Qayta' };
  const contact = (p, chat) => flow.contact({ chat: { id: chat, type: 'private' }, from: { id: chat }, contact: { user_id: chat, phone_number: p } });
  const row = async p => (await pool.query('SELECT * FROM pending_registrations WHERE phone=$1', [p])).rows[0];
  async function oldRejected(token) {
    for (const action of ['status', 'verify', 'resend', 'complete']) {
      const res = await call(action, { sessionToken: token, otp: '12345', ...names });
      assert.equal(res.status, 401); assert.equal(res.body.code, 'invalid_session');
    }
  }
  await t.test('active request is replaced immediately across devices; only new password/role/session survives', async () => {
    const p = await phone(), first = await start(p), old = await row(p);
    const next = await start(p, { password: 'OtherPassword123', role: 'barber', specialty: 'stylist' });
    assert.equal(next.status, 201); assert.equal(next.body.restarted, true);
    assert.notEqual(next.body.sessionToken, first.body.sessionToken);
    const current = await row(p); assert.notEqual(current.id, old.id);
    assert.equal(current.role, 'barber'); assert.equal(current.specialty, 'stylist');
    assert.equal(await verifyPassword('OtherPassword123', current.password_hash), true);
    assert.equal(current.phone_verified_at, null); assert.equal(current.completion_expires_at, null);
    assert.equal((await pool.query('SELECT registration_id FROM telegram_registration_requests WHERE registration_id=$1', [old.id])).rowCount, 0);
    await oldRejected(first.body.sessionToken);
    assert.equal((await call('complete', { sessionToken: next.body.sessionToken, ...names })).status, 403);
    await contact(p, 712345601); const code = deliveries.at(-1).code;
    assert.equal((await call('verify', { sessionToken: next.body.sessionToken, otp: code })).status, 200);
    assert.equal((await call('complete', { sessionToken: next.body.sessionToken, ...names })).status, 201);
    assert.equal((await start(p)).body.code, 'phone_exists');
  });
  await t.test('old delivered OTP/history revoked; cooldown, failed attempts and send budget survive restart', async () => {
    const p = await phone(), first = await start(p); await contact(p, 712345602);
    const oldCode = deliveries.at(-1).code, old = await row(p), before = deliveries.length;
    for (let i = 0; i < 2; i++) await call('verify', { sessionToken: first.body.sessionToken, otp: 'wrong' });
    const next = await start(p); assert.equal(next.status, 201); assert.ok(next.body.deliveryRetryAfter > 0);
    assert.equal((await row(p)).otp_failed_attempts, 2);
    const history = (await pool.query('SELECT * FROM registration_otp_history WHERE registration_id=$1', [old.id])).rows[0];
    assert.ok(history.invalidated_at); assert.equal(history.invalidation_reason, 'registration_restarted');
    await oldRejected(first.body.sessionToken);
    assert.equal((await call('verify', { sessionToken: next.body.sessionToken, otp: oldCode })).body.code, 'otp_not_sent');
    assert.equal((await contact(p, 712345602)).status, 429); assert.equal(deliveries.length, before);
    await pool.query("UPDATE registration_phone_limits SET last_sent_at=clock_timestamp()-INTERVAL '181 seconds' WHERE phone=$1", [p]);
    await contact(p, 712345602); const newCode = deliveries.at(-1).code;
    // Code values are random; force a deterministic rejected value if a new draw coincides.
    const rejectedCode = oldCode === newCode ? (newCode === '00000' ? '11111' : '00000') : oldCode;
    assert.equal((await call('verify', { sessionToken: next.body.sessionToken, otp: rejectedCode })).body.code, 'invalid_otp');
    assert.equal((await row(p)).otp_failed_attempts, 3);
    assert.equal((await pool.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1', [p])).rows[0].send_count, 2);
    assert.equal((await call('verify', { sessionToken: next.body.sessionToken, otp: newCode })).status, 200);
  });
  await t.test('verified-but-unfinished proof cannot be taken over by another start', async () => {
    const p = await phone(), first = await start(p); await contact(p, 712345603);
    await call('verify', { sessionToken: first.body.sessionToken, otp: deliveries.at(-1).code });
    const next = await start(p); assert.equal(next.status, 201);
    await oldRejected(first.body.sessionToken);
    assert.equal((await call('complete', { sessionToken: next.body.sessionToken, ...names })).body.code, 'verification_required');
    assert.equal((await row(p)).phone_verified_at, null);
  });
  await t.test('parallel starts have one committed pending/session/generation', async () => {
    const p = await phone();
    const starts = await Promise.all(Array.from({ length: 6 }, (_, i) => start(p, { password: `ParallelPassword${i}` })));
    assert.ok(starts.every(r => r.status === 201));
    assert.equal(new Set(starts.map(r => r.body.sessionToken)).size, 6);
    const current = await row(p), winner = starts.find(r => sessionHash(r.body.sessionToken) === current.session_token_hash);
    assert.ok(winner);
    assert.equal((await pool.query('SELECT id FROM pending_registrations WHERE phone=$1', [p])).rowCount, 1);
    assert.equal((await pool.query('SELECT registration_id FROM telegram_registration_requests WHERE registration_id=$1', [current.id])).rowCount, 1);
    for (const start of starts.filter(r => r !== winner)) assert.equal((await call('status', { sessionToken: start.body.sessionToken })).status, 401);
    assert.equal((await call('status', { sessionToken: winner.body.sessionToken })).status, 200);
  });
  await t.test('concurrent verify/restart and complete/restart cannot transfer proof or create two accounts', async () => {
    const p = await phone(), first = await start(p); await contact(p, 712345606);
    const code = deliveries.at(-1).code;
    const [proof, next] = await Promise.all([
      call('verify', { sessionToken: first.body.sessionToken, otp: code }), start(p),
    ]);
    assert.ok([200, 401].includes(proof.status)); assert.equal(next.status, 201);
    assert.equal((await row(p)).phone_verified_at, null);
    assert.equal((await call('complete', { sessionToken: next.body.sessionToken, ...names })).status, 403);

    const q = await phone(), old = await start(q); await contact(q, 712345607);
    await call('verify', { sessionToken: old.body.sessionToken, otp: deliveries.at(-1).code });
    const [completed, restarted] = await Promise.all([
      call('complete', { sessionToken: old.body.sessionToken, ...names }), start(q, { password: 'OtherPassword123' }),
    ]);
    const count = (await pool.query('SELECT count(*)::int AS n FROM users WHERE phone=$1', [q])).rows[0].n;
    if (completed.status === 201) {
      assert.equal(restarted.body.code, 'phone_exists'); assert.equal(count, 1);
      assert.equal(await row(q), undefined);
    } else {
      assert.equal(completed.status, 401); assert.equal(restarted.status, 201); assert.equal(count, 0);
      assert.equal((await row(q)).phone_verified_at, null);
    }
  });
  await t.test('replacement failure rolls back old OTP, pending and Telegram generation together', async () => {
    const p = await phone(), first = await start(p); await contact(p, 712345604); const before = await row(p);
    const faulty = { async connect() { const client = await pool.connect(); return { release: client.release.bind(client), async query(sql, args) {
      if (sql.startsWith('INSERT INTO telegram_registration_requests')) throw Error('Injected replacement failure');
      return client.query(sql, args);
    } }; } };
    await assert.rejects(createRegistrationService({ pool: faulty, env, sms }).start({ phone: p, password: 'NewPassword123', role: 'customer' }));
    const current = await row(p); assert.equal(current.id, before.id); assert.equal(current.session_token_hash, before.session_token_hash);
    assert.equal((await call('status', { sessionToken: first.body.sessionToken })).body.deliveryPending, false);
    assert.equal((await pool.query('SELECT invalidated_at FROM registration_otp_history WHERE registration_id=$1', [before.id])).rows[0].invalidated_at, null);
  });
  await t.test('phone block and three-send ceiling cannot be reset with new sessions', async () => {
    const p = await phone(), first = await start(p); await contact(p, 712345605);
    for (let i = 0; i < 5; i++) await call('verify', { sessionToken: first.body.sessionToken, otp: 'wrong' });
    assert.equal((await start(p)).status, 423);
    const q = await phone(); await start(q);
    await pool.query('UPDATE registration_phone_limits SET send_count=3 WHERE phone=$1', [q]);
    assert.equal((await start(q)).status, 423);
    assert.equal((await pool.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1', [q])).rows[0].send_count, 3);
  });
});
