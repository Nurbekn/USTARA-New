// Explicitly authorized disposable PostgreSQL. No .env or application database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createOtpPostgresHarness } = require('./helpers/otpPostgres');
const { createPhoneChangeService } = require('../services/phoneChangeService');
const { createRegistrationService } = require('../services/registrationService');
const { createPasswordResetService } = require('../services/passwordResetService');
const { createTelegramOtpAdapter, createTelegramContacts } = require('../services/telegramOtp');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const { createPhoneChangeController } = require('../controllers/phoneChangeController');
const { createUpdateHandler } = require('../telegram/handler');
const { hashPassword } = require('../utils/passwordPolicy');
const readMigration = name => fs.readFileSync(path.join(__dirname, '../database/migrations', name + '.sql'), 'utf8');

test('phone change: real isolated PostgreSQL and authenticated HTTP', { skip: process.env.USTARA_DISPOSABLE_OTP_TESTS !== 'I_AUTHORIZE_TEMP_DATABASE', timeout: 180000 }, async t => {
  const h = await createOtpPostgresHarness();
  t.after(() => h.close());
  console.log('Ajratilgan PostgreSQL artefaktlari:', h.root);
  await h.admin.query(readMigration('20261122_telegram_phone_requests'));
  await h.admin.query(readMigration('20261123_registration_resend_cooldown'));
  const preserved = (await h.admin.query("INSERT INTO users(phone,password,role) VALUES('+998900000099',$1,'customer') RETURNING *", [await hashPassword('PreservedAccount123')])).rows[0];
  await h.admin.query("INSERT INTO customers(user_id,first_name,last_name,created_at) VALUES($1,'Eski','Mijoz',$2)", [preserved.id, preserved.created_at]);
  const beforeUsers = (await h.admin.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
  await h.admin.query(readMigration('20261124_phone_change'));
  assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM users')).rows[0].n, beforeUsers);
  assert.deepEqual((await h.admin.query('SELECT * FROM users WHERE id=$1',[preserved.id])).rows[0],preserved);
  h.record('migration_preserves_accounts', 'PASS');
  const env = { ...process.env, TELEGRAM_BOT_TOKEN: '123456:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_booking_bot' };
  const password = 'PhoneChangeSecure123', passwordHash = await hashPassword(password);
  const sent = [];let failSend = false;let nextNumber = 1000;
  const api = async (method, body) => {
    assert.equal(method, 'sendMessage');
    if (failSend) throw Error('Test transport failure');
    sent.push(structuredClone(body));
    return { message_id: sent.length, chat: { id: Number(body.chat_id) } };
  };
  const service = createPhoneChangeService({ pool: h.pool, env, api });
  const controller = createPhoneChangeController({ pool: h.pool, env, service });
  const express = require('express'), app = express();
  app.use(require('cors')({ exposedHeaders: ['Retry-After'] }));app.use(express.json());
  const auth = require('../middleware/authMiddleware');
  for (const action of ['start', 'choose', 'status', 'resend', 'verify']) app.post('/api/auth/phone-change/' + action, auth, controller[action]);
  app.post('/api/auth/login', require('../services/loginAuthentication').createRoleLogin(null, h.pool));
  app.post('/protected', auth, (req, res) => res.json({ id: req.user.id }));
  const server = app.listen(0, '127.0.0.1');await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(action, body, token) {
    const response = await fetch(base + (action.startsWith('/') ? action : '/api/auth/phone-change/' + action), {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const number = () => '+99890' + String(++nextNumber).padStart(7, '0');
  const message = (phone, chat) => ({ chat: { id: chat, type: 'private' }, from: { id: chat }, contact: { user_id: chat, phone_number: phone.slice(1) } });
  async function fixture(role = 'customer') {
    const phone = number(), newPhone = number();
    await h.admin.query('BEGIN');
    const user = (await h.admin.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id,created_at', [phone, passwordHash, role])).rows[0];
    const profile = (await h.admin.query(`INSERT INTO ${role === 'customer' ? 'customers' : 'barbers'}(user_id,first_name,last_name,created_at${role === 'barber' ? ',specialty' : ''}) VALUES($1,'Sinov','Foydalanuvchi',$2${role === 'barber' ? ",'barber'" : ''}) RETURNING id`, [user.id, user.created_at])).rows[0];
    await h.admin.query('COMMIT');
    const actor = { id: user.id, profileId: profile.id, role, sessionVersion: 0 };
    const token = jwt.sign(actor, process.env.JWT_SECRET, { expiresIn: '1h' });
    return { actor, token, phone, newPhone, chat: 700000 + user.id, password, profile };
  }
  const start = async f => {
    const r = await service.start({ password }, f.actor, '198.51.100.' + (f.actor.id % 250 + 1));
    assert.equal(r.status, 201);f.session = r.body;return r;
  };
  const choose = f => service.choose({ sessionToken: f.session.sessionToken, phone: f.newPhone }, f.actor);
  const input = f => ({ sessionToken: f.session.sessionToken });
  const row = async f => (await h.admin.query('SELECT * FROM phone_change_requests WHERE user_id=$1', [f.actor.id])).rows[0];
  const code = f => /kodi: (\d{5})/.exec(sent.findLast(s => s.chat_id === String(f.chat) && /kodi:/.test(s.text)).text)[1];
  async function deliver(f) {
    await service.open(message(f.newPhone, f.chat), new URL(f.session.botUrl).searchParams.get('start'));
    const answer = await service.contact(message(f.newPhone, f.chat));assert.equal(answer.body.code, 'otp_sent');return code(f);
  }
  async function ready(role) { const f = await fixture(role);await start(f);await choose(f);await deliver(f);return f; }
  async function age(f, interval = '61 seconds') {
    // Test fixture time shift; production checks use real PostgreSQL clock.
    await h.admin.query(`UPDATE phone_change_requests SET otp_sent_at=otp_sent_at-$2::interval,
      otp_expires_at=otp_expires_at-$2::interval,resend_available_at=resend_available_at-$2::interval WHERE user_id=$1`, [f.actor.id, interval]);
  }
  async function caseTest(name, work) { if (process.env.USTARA_PHONE_CHANGE_CASE && !name.includes(process.env.USTARA_PHONE_CHANGE_CASE)) return; await t.test(name, async () => { await work();h.record(name, 'PASS'); }); }

  await caseTest('password_correct_wrong_and_http_auth', async () => {
    const f = await fixture();
    assert.equal((await call('start', { password }, null)).status, 401);
    const wrong = await call('start', { password: 'WrongPass123' }, f.token);assert.equal(wrong.body.code, 'invalid_password');
    assert.equal(await row(f), undefined);
    const ok = await call('start', { password }, f.token);assert.equal(ok.status, 201);
    assert.match(new URL(ok.body.botUrl).searchParams.get('start'), /^pc_[a-f0-9]{48}$/);
    const stored = await row(f);assert.notEqual(stored.session_token_hash, ok.body.sessionToken);
    assert.equal(stored.new_phone, null);
    f.session = ok.body;
    assert.equal((await call('verify', { ...input(f), otp: '12345' }, f.token)).body.code, 'telegram_contact_required');
    assert.equal((await service.choose({ ...input(f), phone: f.phone }, f.actor).catch(e => e)).code, 'same_phone');
  });
  await caseTest('new_phone_busy_and_wrong_account_session', async () => {
    const a = await fixture(), b = await fixture('barber');await start(a);await start(b);
    await assert.rejects(service.choose({ ...input(a), phone: b.phone }, a.actor), { code: 'phone_change_conflict' });
    await assert.rejects(service.choose({ ...input(a), phone: a.newPhone }, b.actor), { code: 'phone_change_expired' });
    assert.equal((await row(a)).new_phone, null);
  });
  await caseTest('concurrent_phone_reservation_has_one_owner', async () => {
    const a = await fixture(), b = await fixture('barber');await start(a);await start(b);b.newPhone = a.newPhone;
    const answers = await Promise.allSettled([choose(a), choose(b)]);
    assert.equal(answers.filter(a => a.status === 'fulfilled').length, 1);
    assert.equal(answers.find(a => a.status === 'rejected').reason.code, 'phone_change_conflict');
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM phone_change_requests WHERE new_phone=$1', [a.newPhone])).rows[0].n, 1);
  });
  await caseTest('telegram_wrong_phone_forged_forwarded_and_plain_text_rejected', async () => {
    const f = await fixture();await start(f);await choose(f);
    await service.open(message(f.newPhone, f.chat), new URL(f.session.botUrl).searchParams.get('start'));
    await assert.rejects(service.contact(message(number(), f.chat)), { code: 'telegram_phone_mismatch' });
    for (const extra of [{ forward_origin: {} }, { forward_date: 1 }, { contact: { user_id: f.chat + 1, phone_number: f.newPhone } }, { contact: { phone_number: f.newPhone } }]) {
      await assert.rejects(service.contact({ ...message(f.newPhone, f.chat), ...extra }), { code: 'telegram_invalid_contact' });
    }
    const count = sent.length;
    const handler = createUpdateHandler({ api, username: env.TELEGRAM_BOT_USERNAME, contacts: {}, phoneChange: service });
    await handler({ message: { chat: { id: f.chat, type: 'private' }, from: { id: f.chat }, text: f.newPhone } });
    assert.equal(sent.length, count);assert.equal((await row(f)).otp_sent_at, null);
  });
  await caseTest('telegram_chat_of_another_account_cannot_confirm', async () => {
    const a = await fixture(), b = await fixture();await start(a);await choose(a);
    await h.admin.query('INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,user_id,verified_at) VALUES(123456,$1,$2,$3,clock_timestamp())', [b.phone, b.chat, b.actor.id]);
    await assert.rejects(service.open(message(a.newPhone, b.chat), new URL(a.session.botUrl).searchParams.get('start')), { code: 'phone_change_conflict' });
    assert.equal((await row(a)).chat_id, null);
  });
  await caseTest('duplicate_telegram_contact_delivers_once_and_hash_is_not_plaintext', async () => {
    const f = await fixture();await start(f);await choose(f);
    await service.open(message(f.newPhone, f.chat), new URL(f.session.botUrl).searchParams.get('start'));
    const before = sent.length;
    const replies = await Promise.all([service.contact(message(f.newPhone, f.chat)), service.contact(message(f.newPhone, f.chat))]);
    assert.deepEqual(replies.map(r => r.body.code).sort(), ['already_sent', 'otp_sent']);assert.equal(sent.length, before + 1);
    const r = await row(f);assert.notEqual(r.otp_hmac_hash, code(f));assert.match(r.otp_hmac_hash, /^[a-f0-9]{64}$/);
    assert.equal(+r.otp_expires_at - +r.otp_sent_at, 60000);
  });
  await caseTest('wrong_expired_otp_and_resend_limits', async () => {
    const f = await ready(), first = code(f);
    assert.equal((await service.verify({ ...input(f), otp: 'wrong' }, f.actor)).body.code, 'invalid_otp');
    assert.equal((await row(f)).otp_failed_attempts, 1);
    assert.equal((await service.resend(input(f), f.actor)).status, 429);
    await age(f);assert.equal((await service.verify({ ...input(f), otp: first }, f.actor)).body.code, 'otp_expired');
    assert.equal((await service.resend(input(f), f.actor)).body.code, 'otp_sent');
    assert.equal((await row(f)).otp_failed_attempts, 1);
    // Nonces revoke an earlier code, even if a random new code happens to repeat.
    assert.equal((await row(f)).send_count, 2);
    await age(f);assert.equal((await service.resend(input(f), f.actor)).status, 200);
    await age(f);assert.equal((await service.resend(input(f), f.actor)).status, 429);
  });
  await caseTest('five_wrong_codes_block_correct_code_and_resend', async () => {
    const f = await ready(), good = code(f), bad = good === '00000' ? '11111' : '00000';
    for (let i = 0; i < 5; i++) assert.equal((await service.verify({ ...input(f), otp: bad }, f.actor)).body.code, 'invalid_otp');
    assert.equal((await service.verify({ ...input(f), otp: good }, f.actor)).status, 429);
    await age(f);assert.equal((await service.resend(input(f), f.actor)).status, 429);
    assert.equal((await h.admin.query('SELECT phone FROM users WHERE id=$1', [f.actor.id])).rows[0].phone, f.phone);
  });
  await caseTest('password_bruteforce_limit_and_session_restart_revoke_old_capability', async () => {
    const f = await fixture();await start(f);const old = f.session;await start(f);
    await assert.rejects(service.status({ sessionToken: old.sessionToken }, f.actor), { code: 'phone_change_expired' });
    for (let i = 0; i < 3; i++) await service.start({ password: 'bad' }, f.actor, '198.51.100.200');
    assert.equal((await service.start({ password }, f.actor, '198.51.100.201')).status, 429);
    assert.equal((await row(f)).session_token_hash.length, 64);
  });
  await caseTest('session_deadline_and_changed_login_version_are_rechecked', async () => {
    const f = await fixture();await start(f);
    await h.admin.query("UPDATE phone_change_requests SET created_at=created_at-INTERVAL '11 minutes',expires_at=expires_at-INTERVAL '11 minutes' WHERE user_id=$1", [f.actor.id]);
    await assert.rejects(service.status(input(f), f.actor), { code: 'phone_change_expired' });
    await start(f);await h.admin.query('INSERT INTO account_session_versions(user_id,version) VALUES($1,1)', [f.actor.id]);
    assert.equal((await call('status', input(f), f.token)).status, 401);
  });
  await caseTest('provider_failure_rolls_back_delivery_and_budget', async () => {
    const f = await fixture();await start(f);await choose(f);
    await service.open(message(f.newPhone, f.chat), new URL(f.session.botUrl).searchParams.get('start'));
    failSend = true;
    try { await assert.rejects(service.contact(message(f.newPhone, f.chat)), { code: 'telegram_otp_unavailable' }); } finally { failSend = false; }
    const r = await row(f);assert.equal(r.send_count, 0);assert.equal(r.otp_sent_at, null);
    assert.equal((await service.contact(message(f.newPhone, f.chat))).body.code, 'otp_sent');
  });
  for (const role of ['customer', 'barber']) await caseTest(`${role}_atomic_completion_revoke_all_sessions_new_login_and_notification`, async () => {
    const f = await fixture(role), oldChat = f.chat + 100000;
    await h.admin.query('INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,user_id,verified_at) VALUES(123456,$1,$2,$3,clock_timestamp())', [f.phone, oldChat, f.actor.id]);
    const oldLogin = await call('/api/auth/login', { phone: f.phone, password });assert.equal(oldLogin.status, 200);
    await start(f);await choose(f);const good = await deliver(f);
    const profileBefore = (await h.admin.query(`SELECT * FROM ${role === 'customer' ? 'customers' : 'barbers'} WHERE user_id=$1`, [f.actor.id])).rows[0];
    const changed = await call('verify', { ...input(f), otp: good }, f.token);assert.equal(changed.body.code, 'phone_changed');
    const user = (await h.admin.query('SELECT phone,password FROM users WHERE id=$1', [f.actor.id])).rows[0];
    assert.equal(user.phone, f.newPhone);assert.equal(user.password, passwordHash);
    assert.deepEqual((await h.admin.query(`SELECT * FROM ${role === 'customer' ? 'customers' : 'barbers'} WHERE user_id=$1`, [f.actor.id])).rows[0], profileBefore);
    assert.equal((await call('/protected', {}, f.token)).status, 401);assert.equal((await call('/protected', {}, oldLogin.body.token)).status, 401);
    assert.equal((await call('/api/auth/login', { phone: f.phone, password })).status, 401);
    const login = await call('/api/auth/login', { phone: f.newPhone, password });assert.equal(login.status, 200);
    assert.equal((await call('/protected', {}, login.body.token)).status, 200);
    assert.equal((await call('verify', { ...input(f), otp: good }, f.token)).status, 401);
    const contact = (await h.admin.query('SELECT phone,chat_id FROM telegram_otp_contacts WHERE user_id=$1', [f.actor.id])).rows;
    assert.deepEqual(contact, [{ phone: f.newPhone, chat_id: String(f.chat) }]);
    assert.ok(sent.some(s => s.chat_id === String(oldChat) && /almashtirildi/.test(s.text) && !s.text.includes(f.newPhone)));
  });
  await caseTest('concurrent_completion_has_one_winner_and_one_session_version_increment', async () => {
    const f = await ready(), good = code(f);
    const answers = await Promise.allSettled([service.verify({ ...input(f), otp: good }, f.actor), service.verify({ ...input(f), otp: good }, f.actor)]);
    assert.equal(answers.filter(a => a.status === 'fulfilled' && a.value.body.code === 'phone_changed').length, 1);
    assert.equal((await h.admin.query('SELECT version FROM account_session_versions WHERE user_id=$1', [f.actor.id])).rows[0].version, 1);
  });
  await caseTest('database_failure_rolls_back_phone_contacts_and_session_version', async () => {
    const f = await ready(), good = code(f);
    await h.admin.query(`CREATE FUNCTION pc_test_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected test fault'; END $$`);
    await h.admin.query('CREATE TRIGGER pc_test_fault BEFORE INSERT ON account_session_versions FOR EACH ROW EXECUTE FUNCTION pc_test_fault()');
    try { await assert.rejects(service.verify({ ...input(f), otp: good }, f.actor)); }
    finally { await h.admin.query('DROP TRIGGER pc_test_fault ON account_session_versions');await h.admin.query('DROP FUNCTION pc_test_fault()'); }
    assert.equal((await h.admin.query('SELECT phone FROM users WHERE id=$1', [f.actor.id])).rows[0].phone, f.phone);
    assert.equal((await row(f)).completed_at, null);
    assert.equal((await service.verify({ ...input(f), otp: good }, f.actor)).body.code, 'phone_changed');
  });
  await caseTest('notification_failure_is_durable_and_does_not_undo_completion', async () => {
    const f = await ready();
    await h.admin.query('INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,user_id,verified_at) VALUES(123456,$1,$2,$3,clock_timestamp())', [f.phone, f.chat + 100000, f.actor.id]);
    failSend = true;
    try { assert.equal((await service.verify({ ...input(f), otp: code(f) }, f.actor)).body.code, 'phone_changed'); } finally { failSend = false; }
    assert.equal((await h.admin.query('SELECT sent_at FROM phone_change_notices WHERE user_id=$1', [f.actor.id])).rows[0].sent_at, null);
    await h.admin.query("UPDATE phone_change_notices SET retry_at=clock_timestamp()-INTERVAL '1 second' WHERE user_id=$1", [f.actor.id]);
    await service.flushNotices();assert.ok((await h.admin.query('SELECT sent_at FROM phone_change_notices WHERE user_id=$1', [f.actor.id])).rows[0].sent_at);
  });
  await caseTest('signup_reset_and_booking_telegram_contexts_remain_isolated', async () => {
    const f = await fixture();await start(f);await choose(f);
    const contacts = createTelegramContacts({ pool: h.pool, botId: 123456 });
    const otpAdapter = createTelegramOtpAdapter({ pool: h.pool, env, api, logger: { error() {} } });
    const registration = createRegistrationService({ pool: h.pool, env, sms: otpAdapter });
    const registrationFlow = createTelegramRegistration({ pool: h.pool, env, contacts, deliver: registration.deliverTelegram });
    const regPhone = number(), reg = await registration.start({ phone: regPhone, password, role: 'customer' });
    const before = await h.state(regPhone);
    const handler = createUpdateHandler({ api, username: env.TELEGRAM_BOT_USERNAME, contacts, phoneChange: service, registration: registrationFlow,
      service: { consume: async () => { handler.bookingLinked = true; } } });
    await handler({ message: { ...message(f.newPhone, f.chat), contact: undefined, text: '/start ' + new URL(f.session.botUrl).searchParams.get('start') } });
    await handler({ message: message(f.newPhone, f.chat) });assert.deepEqual(await h.state(regPhone), before);
    // A plain /start switches contact purpose to signup without revoking pc OTP.
    await handler({ message: { ...message(regPhone, f.chat + 1), contact: undefined, text: '/start' } });
    await handler({ message: message(regPhone, f.chat + 1) });
    const regCode = /kodi: (\d{5})/.exec(sent.findLast(s => s.chat_id === String(f.chat + 1) && /kodi:/.test(s.text)).text)[1];
    assert.equal((await registration.verify({ sessionToken: reg.body.sessionToken, otp: regCode })).status, 200);
    assert.equal((await registration.complete({ sessionToken: reg.body.sessionToken, firstName: 'Sinov', lastName: 'Mijoz' })).status, 201);
    const reset = createPasswordResetService({ pool: h.pool, env, sms: otpAdapter });
    const r = await reset.start({ phone: regPhone });
    const resetCode = /kodi: (\d{5})/.exec(sent.findLast(s => s.chat_id === String(f.chat + 1) && /kodi:/.test(s.text)).text)[1];
    const verified = await reset.verify({ challengeToken: r.body.challengeToken, otp: resetCode });assert.equal(verified.status, 200);
    assert.equal((await reset.complete({ resetToken: verified.body.resetToken, password: 'NewResetSecure456' })).status, 200);
    await handler({ message: { ...message(f.phone, f.chat), contact: undefined, text: '/start booking_token' } });assert.equal(handler.bookingLinked, true);
    assert.equal((await row(f)).completed_at, null);
  });
  await caseTest('extended_same_telegram_chat_rebinds_only_its_owner', async () => {
    const f = await fixture();
    await h.admin.query('INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,user_id,verified_at) VALUES(123456,$1,$2,$3,clock_timestamp())', [f.phone, f.chat, f.actor.id]);
    await start(f);await choose(f);await deliver(f);
    assert.equal((await service.verify({ ...input(f), otp: code(f) }, f.actor)).body.code, 'phone_changed');
    assert.deepEqual((await h.admin.query('SELECT phone,chat_id,user_id FROM telegram_otp_contacts WHERE user_id=$1', [f.actor.id])).rows, [{ phone: f.newPhone, chat_id: String(f.chat), user_id: f.actor.id }]);
  });
  await caseTest('extended_real_webhook_routes_pc_and_deduplicates_updates', async () => {
    const { createWebhookController } = require('../telegram/webhook');
    const f = await fixture();await start(f);await choose(f);
    const webhookEnv = { ...env, TELEGRAM_UPDATE_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: 'integration_secret_'.repeat(3) };
    const webhook = createWebhookController({ pool: h.pool, env: webhookEnv, api });
    const response = () => ({ set() {}, sendStatus(code) { this.statusCode = code; return this; } });
    const run = async update => { const res = response();await webhook({ get: () => webhookEnv.TELEGRAM_WEBHOOK_SECRET, body: update }, res);assert.equal(res.statusCode, 200); };
    await run({ update_id: 800001, message: { ...message(f.newPhone, f.chat), contact: undefined, text: '/start ' + new URL(f.session.botUrl).searchParams.get('start') } });
    const before = sent.length;
    const update = { update_id: 800002, message: message(f.newPhone, f.chat) };
    await run(update);const count = sent.length;await run(update);
    assert.equal(sent.length, count);assert.ok(count > before);assert.equal((await row(f)).send_count, 1);
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM telegram_webhook_receipts WHERE bot_id=123456 AND update_id=800002')).rows[0].n, 1);
  });
  await caseTest('extended_bookings_social_and_booking_telegram_survive_phone_change', async () => {
    await h.admin.query('CREATE EXTENSION btree_gist WITH SCHEMA public');
    for (const name of ['20261115_slots_02_booking_no_overlap', '20261116_account_profile_deletion_integrity', '20261117_barber_profile', '20261117_barber_profile_02_booking_acceptance', '20261118_social_portfolio_reviews']) await h.admin.query(readMigration(name));
    const customer = await fixture(), barber = await fixture('barber');
    const s = (await h.admin.query("INSERT INTO services(barber_id,name,price,duration_minutes) VALUES($1,'Soch olish',50000,30) RETURNING id", [barber.profile.id])).rows[0];
    const booking = (await h.admin.query("INSERT INTO bookings(customer_id,barber_id,service_id,booking_time,duration_minutes) VALUES($1,$2,$3,clock_timestamp()+INTERVAL '2 days',30) RETURNING *", [customer.profile.id, barber.profile.id, s.id])).rows[0];
    const media = (await h.admin.query("INSERT INTO ustara_media(owner_user_id,content_type,content,byte_length) VALUES($1,'image/png',decode('00','hex'),1) RETURNING id", [barber.actor.id])).rows[0];
    const post = (await h.admin.query("INSERT INTO social_posts(barber_id,caption,media_ids) VALUES($1,'Saqlanishi kerak',$2) RETURNING *", [barber.profile.id, [media.id]])).rows[0];
    await h.admin.query('INSERT INTO social_follows(customer_user_id,barber_id) VALUES($1,$2)', [customer.actor.id, barber.profile.id]);
    await h.admin.query('INSERT INTO social_likes(post_id,user_id) VALUES($1,$2)', [post.id, customer.actor.id]);
    await h.admin.query('INSERT INTO barber_telegram_links(barber_id,chat_id,linked_at) VALUES($1,$2,clock_timestamp())', [barber.profile.id, barber.chat]);
    for (const f of [customer, barber]) { await start(f);await choose(f);await deliver(f);assert.equal((await service.verify({ ...input(f), otp: code(f) }, f.actor)).body.code, 'phone_changed'); }
    assert.deepEqual((await h.admin.query('SELECT * FROM bookings WHERE id=$1', [booking.id])).rows[0], booking);
    assert.deepEqual((await h.admin.query('SELECT * FROM social_posts WHERE id=$1', [post.id])).rows[0], post);
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM social_likes WHERE user_id=$1', [customer.actor.id])).rows[0].n, 1);
    assert.equal((await h.admin.query('SELECT count(*)::int AS n FROM social_follows WHERE customer_user_id=$1', [customer.actor.id])).rows[0].n, 1);
    const replies = [];
    const handler = createUpdateHandler({ api: async (method, body) => replies.push({ method, body }), username: env.TELEGRAM_BOT_USERNAME,
      botId: 123456, bookings: require('../services/bookingStatusService').createBookingStatusService({ pool: h.pool }) });
    await handler({ callback_query: { id: 'test-callback', from: { id: barber.chat }, data: 'booking:confirmed:' + booking.id,
      message: { message_id: 77, chat: { id: barber.chat, type: 'private' }, from: { id: 123456, is_bot: true } } } });
    assert.equal((await h.admin.query('SELECT status FROM bookings WHERE id=$1', [booking.id])).rows[0].status, 'confirmed');
    assert.ok(replies.some(r => r.method === 'answerCallbackQuery' && r.body.show_alert === false));
  });
  if (process.env.USTARA_PHONE_CHANGE_E2E === '1') {
    await caseTest('mobile_customer_and_barber_real_phone_change_http_postgres', async () => {
      const { runPhoneChangeMobile } = require('./helpers/phoneChangeMobile');
      for (const role of ['customer', 'barber']) {
        if (process.env.USTARA_PHONE_CHANGE_ROLE && process.env.USTARA_PHONE_CHANGE_ROLE !== role) continue;
        const f = await fixture(role);
        await runPhoneChangeMobile({ base, f, service, code: () => code(f), artifacts: h.root });
        assert.equal((await h.admin.query('SELECT phone FROM users WHERE id=$1', [f.actor.id])).rows[0].phone, f.newPhone);
      }
    });
  }
});
