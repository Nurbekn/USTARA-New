// No dotenv, db.js, migration or DDL. Run only after separately approved setup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { testTarget, assertTestConnection } = require('./helpers/testDatabaseTarget');
const { createRegistrationService } = require('../services/registrationService');
const { createPasswordResetService } = require('../services/passwordResetService');
const { createTelegramContacts, createTelegramOtpAdapter } = require('../services/telegramOtp');
const { createTelegramRegistration } = require('../services/telegramRegistration');
const { createOtpRateLimit } = require('../services/otpRateLimit');
const { createWebhookController } = require('../telegram/webhook');
const enabled = process.env.NODE_ENV === 'test'
  && process.env.USTARA_TELEGRAM_AUTH_TESTS === 'I_AUTHORIZE_TEST_DATA'
  && Boolean(process.env.USTARA_TEST_DATABASE_URL);

test('Telegram auth: haqiqiy PostgreSQL tranzaksiyalari, FK, UNIQUE va parallel so‘rovlar', { skip: !enabled }, async t => {
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, 'Telegram auth testi', ['ustara_account_test']);
  const pool = new Pool({ connectionString: process.env.USTARA_TEST_DATABASE_URL, ssl: false, max: 6,
    connectionTimeoutMillis: 5000, options: '-c search_path=public -c timezone=UTC' });
  const phones = [], accounts = [];
  const botId = crypto.randomInt(100000000, 900000000);
  const rateKeys = [], webhookIds = [];
  let identityVerified = false;
  t.after(async () => {
    try {
      if (identityVerified) {
        await assertTestConnection(pool, target);
        for (const account of accounts) await pool.query('DELETE FROM users WHERE id=$1 AND phone=$2', [account.id, account.phone]);
        await pool.query('DELETE FROM telegram_otp_contacts WHERE bot_id=$1 AND phone=ANY($2::text[])', [botId, phones]);
        // All cleanup is scoped to random phones reserved by this run.
        for (const table of ['password_reset_requests','password_reset_events','password_reset_limits',
          'pending_registrations','registration_otp_history','registration_security_events','registration_phone_limits']) {
          await pool.query(`DELETE FROM ${table} WHERE phone=ANY($1::text[])`, [phones]);
        }
        for (const key of rateKeys) await pool.query('DELETE FROM otp_request_limits WHERE scope=$1 AND key_hash=$2', ['telegram', key]);
        if (webhookIds.length) await pool.query('DELETE FROM telegram_webhook_receipts WHERE bot_id=$1 AND update_id=ANY($2::bigint[])', [botId, webhookIds]);
      }
    } finally { await pool.end(); }
  });
  await assertTestConnection(pool, target); identityVerified = true;
  assert.equal((await pool.query('SELECT current_schema() AS name')).rows[0].name, 'public');
  assert.equal((await pool.query("SELECT version FROM ustara_schema_migrations WHERE version='20261122_telegram_phone_requests'")).rows.length, 1,
    'Yangi migration oldindan alohida ruxsat bilan qo‘llangan bo‘lishi kerak');
  const env = { NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: botId + ':' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot',
    OTP_HMAC_KEY: crypto.randomBytes(48).toString('hex'), JWT_SECRET: crypto.randomBytes(48).toString('hex') };
  let failDelivery = false;
  const codes = [], attemptedCodes = [];
  const sms = createTelegramOtpAdapter({ pool, env, logger: { error() {} }, api: async (_method, body) => {
    attemptedCodes.push(/kodi: (\d{5})/.exec(body.text)[1]);
    if (failDelivery) throw Error('Simulated transport timeout');
    codes.push(/kodi: (\d{5})/.exec(body.text)[1]); return { message_id: codes.length, chat: { id: body.chat_id } };
  } });
  const registration = createRegistrationService({ pool, env, sms });
  const reset = createPasswordResetService({ pool, env, sms });
  const contacts = createTelegramContacts({ pool, botId });
  const flow = createTelegramRegistration({ pool, env, contacts, deliver: registration.deliverTelegram });
  async function freshPhone() {
    for (;;) {
      const phone = '+998' + crypto.randomInt(900000000, 999999999);
      const used = await pool.query(`SELECT phone FROM users WHERE phone=$1 UNION ALL
        SELECT phone FROM registration_phone_limits WHERE phone=$1 UNION ALL
        SELECT phone FROM password_reset_limits WHERE phone=$1 UNION ALL SELECT phone FROM telegram_otp_contacts WHERE phone=$1`, [phone]);
      if (!used.rows.length && !phones.includes(phone)) { phones.push(phone); return phone; }
    }
  }
  const phone = await freshPhone(), chat = String(crypto.randomInt(100000000, 900000000));
  const message = { chat: { id: chat, type: 'private' }, from: { id: chat }, contact: { user_id: chat, phone_number: phone } };
  const started = await registration.start({ phone, password: 'TelegramTest123', role: 'customer' });
  const sessionToken = started.body.sessionToken;
  assert.equal(started.body.botUrl, 'https://t.me/ustara_test_bot');
  await t.test('umumiy havola; begona kontakt rad etiladi va so‘rovsiz raqam kod olmaydi', async () => {
    await assert.rejects(flow.contact({ ...message, contact: { ...message.contact, user_id: '1' } }), { code: 'telegram_invalid_contact' });
    assert.equal(await flow.contact({ ...message, contact: { ...message.contact, phone_number: '+998901111111' } }), null);
  });
  await t.test('provider xatosi OTP va yuborish hisobini rollback qiladi; parallel contact faqat bitta kod yuboradi', async () => {
    failDelivery = true;
    await assert.rejects(flow.contact(message), { code: 'telegram_otp_unavailable' });
    assert.equal((await pool.query('SELECT delivered_at FROM telegram_registration_requests WHERE registration_id=(SELECT id FROM pending_registrations WHERE phone=$1)', [phone])).rows[0].delivered_at, null);
    assert.equal((await pool.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1', [phone])).rows[0].send_count, 0);
    failDelivery = false;
    const result = await Promise.all([flow.contact(message), flow.contact(message)]);
    assert.deepEqual(result.map(r => r.body.code).sort(), ['already_sent', 'otp_sent']);
    assert.equal(codes.length, 1);
  });
  await t.test('OTP bir martalik; account va Telegram FK bog‘lanishi birga yaratiladi', async () => {
    const code = codes.at(-1), wrong = code === '00000' ? '11111' : '00000';
    assert.equal((await registration.verify({ sessionToken, otp: wrong })).body.attemptsRemaining, 4);
    assert.equal((await registration.verify({ sessionToken, otp: code })).body.code, 'phone_verified');
    assert.equal((await registration.verify({ sessionToken, otp: code })).body.code, 'already_verified');
    assert.equal((await registration.complete({ sessionToken, firstName: 'Sinov', lastName: 'Foydalanuvchi' })).status, 201);
    const account = (await pool.query('SELECT id,phone FROM users WHERE phone=$1', [phone])).rows[0]; accounts.push(account);
    assert.equal((await pool.query('SELECT user_id FROM telegram_otp_contacts WHERE bot_id=$1 AND phone=$2', [botId, phone])).rows[0].user_id, account.id);
    await assert.rejects(registration.complete({ sessionToken, firstName: 'Sinov', lastName: 'Foydalanuvchi' }), { code: 'invalid_session' });
  });
  await t.test('bir Telegram boshqa raqamga bog‘lanmaydi; UNIQUE bevosita SQLda ham himoya qiladi', async () => {
    const another = await freshPhone();
    await assert.rejects(contacts.bind({ ...message, contact: { ...message.contact, phone_number: another } }), { code: 'telegram_link_conflict' });
    await assert.rejects(pool.query('INSERT INTO telegram_otp_contacts(bot_id,phone,chat_id,verified_at) VALUES($1,$2,$3,clock_timestamp())', [botId, another, chat]), { code: '23505' });
  });
  await t.test('Forgot Password doimiy account bog‘lanishidan foydalanadi; OTP/token takror ishlamaydi', async () => {
    await pool.query("UPDATE telegram_otp_contacts SET verified_at=verified_at-INTERVAL '2 days' WHERE bot_id=$1 AND phone=$2", [botId, phone]);
    const begin = await reset.start({ phone }), challengeToken = begin.body.challengeToken;
    assert.equal(codes.length, 2);
    const proof = await reset.verify({ challengeToken, otp: codes.at(-1) }); assert.equal(proof.status, 200);
    assert.equal((await reset.complete({ resetToken: proof.body.resetToken, password: 'UpdatedTest123' })).status, 200);
    await assert.rejects(reset.verify({ challengeToken, otp: codes.at(-1) }), { code: 'invalid_reset_session' });
  });
  await t.test('yuborilmagan reset kodi tasdiqlanmaydi; noma’lum telefon javobi bir xil', async () => {
    await pool.query("UPDATE password_reset_limits SET last_sent_at=clock_timestamp()-INTERVAL '181 seconds' WHERE phone=$1", [phone]);
    failDelivery = true;
    const known = await reset.start({ phone });
    // A new unknown phone has no recipient and still receives the same envelope.
    const unknown = await reset.start({ phone: await freshPhone() });
    assert.deepEqual(Object.keys(known.body).sort(), Object.keys(unknown.body).sort());
    assert.equal(known.body.message, unknown.body.message);
    assert.equal((await pool.query('SELECT delivered_at FROM password_reset_requests WHERE phone=$1', [phone])).rows[0].delivered_at, null);
    assert.equal((await reset.verify({ challengeToken: known.body.challengeToken, otp: attemptedCodes.at(-1) })).body.code, 'invalid_otp');
    failDelivery = false;
  });
  await t.test('Telegramga bog‘lanmagan eski account kontakt bilan o‘zlashtirilmaydi va kod olmaydi', async () => {
    const legacyPhone = await freshPhone(), client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = (await client.query("INSERT INTO users(phone,password,role) VALUES($1,$2,'customer') RETURNING id,phone", [legacyPhone, 'unused-test-password-hash'])).rows[0];
      await client.query('INSERT INTO customers(user_id,first_name,last_name) VALUES($1,$2,$3)', [account.id, 'Eski', 'Hisob']);
      await client.query('COMMIT'); accounts.push(account);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const before = attemptedCodes.length;
    const begin = await reset.start({ phone: legacyPhone }); assert.equal(begin.status, 200);
    assert.equal(attemptedCodes.length, before);
    await assert.rejects(contacts.bind({ chat: { id: '99', type: 'private' }, from: { id: '99' }, contact: { user_id: '99', phone_number: legacyPhone } }), { code: 'telegram_link_conflict' });
  });
  await t.test('haqiqiy bazadagi muddati tugagan challenge rad etiladi', async () => {
    const expiringPhone = await freshPhone();
    await registration.start({ phone: expiringPhone, password: 'TelegramTest123', role: 'customer' });
    await pool.query("UPDATE telegram_registration_requests SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE registration_id=(SELECT id FROM pending_registrations WHERE phone=$1)", [expiringPhone]);
    assert.equal(await flow.contact({chat:{id:98,type:'private'},from:{id:98},contact:{user_id:98,phone_number:expiringPhone}}), null);
  });
  await t.test('qayta yuborish, eski generation va muddati tugagan OTP haqiqiy bazada', async () => {
    const p = await freshPhone(), chatId = '765432109';
    const begin = await registration.start({phone:p,password:'TelegramTest123',role:'barber',specialty:'barber'});
    const input = {sessionToken:begin.body.sessionToken};
    const own = {chat:{id:chatId,type:'private'},from:{id:chatId},contact:{user_id:chatId,phone_number:p}};
    await flow.contact(own);
    const oldCode = codes.at(-1);
    assert.match(oldCode,/^\d{5}$/);
    assert.equal((await registration.resend(input)).status,429);
    const old = (await pool.query('SELECT id FROM pending_registrations WHERE phone=$1',[p])).rows[0];
    const generation = (await pool.query('SELECT token_hash FROM telegram_registration_requests WHERE registration_id=$1',[old.id])).rows[0].token_hash;
    await pool.query("UPDATE pending_registrations SET created_at=created_at-INTERVAL '181 seconds',otp_sent_at=statement_timestamp()-INTERVAL '181 seconds',otp_expires_at=statement_timestamp()-INTERVAL '1 second' WHERE phone=$1",[p]);
    await pool.query("UPDATE registration_phone_limits SET last_sent_at=clock_timestamp()-INTERVAL '181 seconds' WHERE phone=$1",[p]);
    assert.equal((await registration.verify({...input,otp:oldCode})).body.code,'otp_expired');
    assert.equal((await registration.resend(input)).body.deliveryPending,true);
    await assert.rejects(registration.deliverTelegram({registrationId:old.id,tokenHash:generation,phone:p,chatId}),{code:'telegram_request_expired'});
    await flow.contact(own);
    assert.notEqual(codes.at(-1),oldCode);
    assert.equal((await registration.verify({...input,otp:oldCode})).body.code,'invalid_otp');
    assert.equal((await registration.verify({...input,otp:codes.at(-1)})).status,200);
    assert.equal((await registration.complete({...input,firstName:'Sinov',lastName:'Usta'})).status,201);
    accounts.push((await pool.query('SELECT id,phone FROM users WHERE phone=$1',[p])).rows[0]);
  });
  await t.test('eski chat so‘rovi yangi telefon so‘rovini 23505 bilan to‘smaydi', async () => {
    const first = await freshPhone(), second = await freshPhone(), chatId = '876543210';
    for (const p of [first,second]) await registration.start({phone:p,password:'TelegramTest123',role:'customer'});
    // Reproduce a legacy deep-link claim without changing contact ownership.
    await pool.query('UPDATE telegram_registration_requests SET chat_id=$2 WHERE registration_id=(SELECT id FROM pending_registrations WHERE phone=$1)',[first,chatId]);
    const result = await flow.contact({chat:{id:chatId,type:'private'},from:{id:chatId},contact:{user_id:chatId,phone_number:second}});
    assert.equal(result.body.code,'otp_sent');
    const rows = await pool.query('SELECT registration_id FROM telegram_registration_requests WHERE bot_id=$1 AND chat_id=$2',[botId,chatId]);
    assert.equal(rows.rowCount,2);
    assert.equal((await pool.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1',[first])).rows[0].send_count,0);
  });
  await t.test('haqiqiy parallel UPSERT yagona umumiy limitni saqlaydi', async () => {
    const identity = crypto.randomBytes(16).toString('hex');
    rateKeys.push(crypto.createHmac('sha256', env.OTP_HMAC_KEY).update(JSON.stringify(['otp-rate','telegram',identity])).digest('hex'));
    const consume = createOtpRateLimit({ pool, env });
    const results = await Promise.all(Array.from({ length: 8 }, () => consume('telegram', identity, 3, 60)));
    assert.equal(results.filter(Boolean).length, 3);
  });
  await t.test('Webhook: haqiqiy service SAVEPOINT, receipt oldidagi rollback, parallel retry va controller restart', async () => {
    const webhookPhone = await freshPhone(), chatId = 987654321;
    await registration.start({ phone: webhookPhone, password: 'TelegramTest123', role: 'customer' });
    const webhookEnv = { ...env, TELEGRAM_UPDATE_MODE: 'webhook', TELEGRAM_WEBHOOK_SECRET: crypto.randomBytes(32).toString('hex') };
    const replies = [];
    const api = async (method, body) => {
      replies.push({ method, body }); return { message_id: replies.length, chat: { id: body.chat_id } };
    };
    let failReceipt = true;
    const faultPool = { async connect() {
      const client = await pool.connect();
      return { release: client.release.bind(client), connection: client.connection,
        on: client.on.bind(client), removeListener: client.removeListener.bind(client), async query(sql, args) {
        if (failReceipt && sql.startsWith('INSERT INTO telegram_webhook_receipts')) {
          failReceipt = false; throw Error('Injected failure after handler');
        }
        return client.query(sql, args);
      } };
    } };
    async function freshUpdateId() {
      for (;;) {
        const id = crypto.randomInt(1, 2147483647);
        if (!webhookIds.includes(id) && !(await pool.query('SELECT update_id FROM telegram_webhook_receipts WHERE bot_id=$1 AND update_id=$2', [botId, id])).rows.length) {
          webhookIds.push(id); return id;
        }
      }
    }
    const call = async (controller, update) => {
      const res = { set() {}, sendStatus(code) { this.statusCode = code; return this; } };
      await controller({ get: () => webhookEnv.TELEGRAM_WEBHOOK_SECRET, body: update }, res); return res.statusCode;
    };
    const claimId = await freshUpdateId();
    const claim = { update_id: claimId, message: { chat: { id: chatId, type: 'private' }, from: { id: chatId }, text: '/start' } };
    assert.equal(await call(createWebhookController({ pool: faultPool, env: webhookEnv, api }), claim), 503);
    const lookup = () => pool.query('SELECT chat_id,delivered_at FROM telegram_registration_requests WHERE registration_id=(SELECT id FROM pending_registrations WHERE phone=$1)', [webhookPhone]);
    assert.equal((await lookup()).rows[0].chat_id, null); assert.equal(replies.length, 0);
    const statuses = await Promise.all([1, 2].map(() => call(createWebhookController({ pool, env: webhookEnv, api }), claim)));
    assert.ok(statuses.includes(200)); assert.ok(statuses.every(status => [200, 503].includes(status)));
    assert.equal(await call(createWebhookController({ pool, env: webhookEnv, api }), claim), 200);
    assert.equal(replies.length, 1); assert.equal((await lookup()).rows[0].chat_id, null);
    const key = crypto.createHmac('sha256', env.OTP_HMAC_KEY).update(JSON.stringify(['otp-rate','telegram',String(chatId)])).digest('hex');
    rateKeys.push(key);
    assert.equal((await pool.query("SELECT request_count FROM otp_request_limits WHERE scope='telegram' AND key_hash=$1", [key])).rows[0].request_count, 1);

    const contactId = await freshUpdateId(), contact = { update_id: contactId,
      message: { chat: { id: chatId, type: 'private' }, from: { id: chatId }, contact: { user_id: chatId, phone_number: webhookPhone } } };
    failReceipt = true;
    assert.equal(await call(createWebhookController({ pool: faultPool, env: webhookEnv, api }), contact), 503);
    assert.equal((await lookup()).rows[0].delivered_at, null);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM registration_otp_history WHERE phone=$1', [webhookPhone])).rows[0].n, 0);
    assert.equal(await call(createWebhookController({ pool, env: webhookEnv, api }), contact), 200);
    assert.equal(await call(createWebhookController({ pool, env: webhookEnv, api }), contact), 200);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM registration_otp_history WHERE phone=$1', [webhookPhone])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT send_count FROM registration_phone_limits WHERE phone=$1', [webhookPhone])).rows[0].send_count, 1);
    assert.equal(replies.filter(reply => /USTARA tasdiqlash kodi:/.test(reply.body.text || '')).length, 2,
      'Tashqi OTP rollbackdan qaytmaydi: ikkita tarmoq yuborishi, faqat bitta committed issuance');
  });
});
