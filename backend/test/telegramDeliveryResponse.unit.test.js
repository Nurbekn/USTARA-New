const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTelegramApi } = require('../telegram/api');
const { createTelegramOtpAdapter } = require('../services/telegramOtp');
const { createRegistrationService } = require('../services/registrationService');
const { createPasswordResetService } = require('../services/passwordResetService');
const { createMemoryPool } = require('./helpers/registrationPool');
const { createPasswordResetPool } = require('./helpers/passwordResetPool');
const env = { NODE_ENV: 'test', TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_test_bot',
  OTP_HMAC_KEY: 'unit-delivery-response-'.repeat(3), JWT_SECRET: 'unit-signing' };
const phone = '+998901234567';
const valid = { message_id: 1, chat: { id: 42, type: 'private' } };
const invalid = [
  ['result yo‘q', { ok: true }],
  ['message_id yo‘q', { ok: true, result: { chat: { id: 42 } } }],
  ...[0, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1].map(id => ['message_id ' + id, { ok: true, result: { ...valid, message_id: id } }]),
  ['chat mos emas', { ok: true, result: { ...valid, chat: { id: 43 } } }],
  ['chat yo‘q', { ok: true, result: { message_id: 1 } }],
  ['ok noto‘g‘ri', { ok: 'true', result: valid }],
];
const transport = envelope => createTelegramApi(env.TELEGRAM_BOT_TOKEN, async () => ({ ok: true, status: 200, json: async () => envelope }));
for (const [name, envelope] of invalid) test('Telegram javobi rad etiladi: ' + name, async () => {
  const api = transport(envelope);
  await assert.rejects(api('sendMessage', { chat_id: '42', text: '000123' }), error => {
    assert.equal(error.message, 'Telegram API unavailable'); assert.equal(error.cause, undefined); return true;
  });
  const logs = [];
  const sms = createTelegramOtpAdapter({ pool: { query: async () => ({ rows: [{ chat_id: '42' }] }) }, env,
    api: async () => envelope.result, logger: { error: (...args) => logs.push(args) } });
  if (envelope.ok === true) {
    await assert.rejects(sms.send({ phone, code: '000123' }), { code: 'telegram_otp_unavailable' });
    assert.ok(!JSON.stringify(logs).includes('000123')); assert.ok(!JSON.stringify(logs).includes(env.TELEGRAM_BOT_TOKEN));
  }
});
test('Telegramning haqiqiy Message javobi va teng number/string chat ID qabul qilinadi', async () => {
  assert.deepEqual(await transport({ ok: true, result: valid })('sendMessage', { chat_id: '42' }), valid);
  const exact = { message_id: 2, chat: { id: '9007199254740993' } };
  assert.deepEqual(await transport({ ok: true, result: exact })('sendMessage', { chat_id: exact.chat.id }), exact);
  await assert.rejects(transport({ ok: true, result: exact })('sendMessage', { chat_id: Number(exact.chat.id) }));
});
test('HTTP xatosidagi ok:true javobi ham muvaffaqiyat hisoblanmaydi', async () => {
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN, async () => ({ ok: false, status: 502,
    json: async () => ({ ok: true, result: valid }) }));
  await assert.rejects(api('sendMessage', { chat_id: '42' }), { code: 502 });
});

// The real service and adapter run against existing transaction doubles, never pg.
function recipientPool(base) {
  return { async connect() {
    const client = await base.connect();
    return { release: client.release, query: (sql, args) => sql.startsWith('SELECT chat_id FROM telegram_otp_contacts')
      ? Promise.resolve({ rows: [{ chat_id: '42' }] }) : client.query(sql, args) };
  } };
}
for (const [name, envelope] of invalid.filter(([, e]) => e.ok === true)) {
  test('Registration delivered/history/budget rollback: ' + name, async () => {
    const base = createMemoryPool(), pool = recipientPool(base);
    const sms = createTelegramOtpAdapter({ pool, env, api: transport(envelope), logger: { error() {} } });
    const service = createRegistrationService({ pool, env, sms, passwords: { validateRegistrationPassword: () => null, hashPassword: async () => 'unit-hash' } });
    await service.start({ phone, role: 'customer', password: 'SamplePass123' });
    const r = base.state.telegramRequests[0]; r.chat_id = '42';
    await assert.rejects(service.deliverTelegram({ registrationId: r.registration_id, tokenHash: r.token_hash, phone, chatId: '42' }), { code: 'telegram_otp_unavailable' });
    assert.equal(base.state.telegramRequests[0].delivered_at, null);
    assert.equal(base.state.history.length, 0); assert.equal(base.state.limits[0].send_count, 0);
  });
  test('Password reset delivered yozilmaydi: ' + name, async () => {
    const base = createPasswordResetPool(), pool = recipientPool(base);
    const sms = createTelegramOtpAdapter({ pool, env, api: transport(envelope), logger: { error() {} } });
    const service = createPasswordResetService({ pool, env, sms });
    const result = await service.start({ phone }); assert.equal(result.status, 200);
    assert.ok(!base.state.requests[0].delivered_at);
    assert.equal(base.state.events.at(-1).event_type, 'sms_delivery_failed');
  });
}
test('Tasdiqlangan javobdan keyingina registration va reset delivered holati yoziladi', async () => {
  for (const registration of [true, false]) {
    const base = registration ? createMemoryPool() : createPasswordResetPool(), pool = recipientPool(base);
    const sms = createTelegramOtpAdapter({ pool, env, api: transport({ ok: true, result: valid }), logger: { error() {} } });
    if (registration) {
      const service = createRegistrationService({ pool, env, sms, passwords: { validateRegistrationPassword: () => null, hashPassword: async () => 'unit-hash' } });
      await service.start({ phone, role: 'customer', password: 'SamplePass123' });
      const r = base.state.telegramRequests[0]; r.chat_id = '42';
      await service.deliverTelegram({ registrationId: r.registration_id, tokenHash: r.token_hash, phone, chatId: '42' });
      assert.ok(base.state.telegramRequests[0].delivered_at);
    } else {
      await createPasswordResetService({ pool, env, sms }).start({ phone });
      assert.ok(base.state.requests[0].delivered_at);
    }
  }
});
