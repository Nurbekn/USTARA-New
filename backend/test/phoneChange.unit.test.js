const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authenticContact, phoneValue, createPhoneChangeService } = require('../services/phoneChangeService');
const { createPhoneChangeController } = require('../controllers/phoneChangeController');
const { createUpdateHandler } = require('../telegram/handler');
const { createOtpCrypto } = require('../utils/registration');
const env = { OTP_HMAC_KEY: 'k'.repeat(64), TELEGRAM_BOT_TOKEN: '123:' + 'x'.repeat(30), TELEGRAM_BOT_USERNAME: 'ustara_booking_bot' };
const message = { chat: { id: 42, type: 'private' }, from: { id: 42 }, contact: { user_id: 42, phone_number: '998901234567' } };
test('phone change accepts only +998 and authentic private self-contact', () => {
  assert.equal(phoneValue('+998901234567'), '+998901234567');
  for (const phone of ['901234567', '+79012345678', null, '+99890123456a']) assert.throws(() => phoneValue(phone));
  assert.ok(authenticContact(message));
  for (const extra of [{ forward_origin: {} }, { forward_date: 1 }, { contact: { user_id: 43 } }, { contact: { phone_number: '998901234567' } }, { chat: { id: 42, type: 'group' } }, { from: { id: 42, is_bot: true } }]) assert.ok(!authenticContact({ ...message, ...extra }));
});
test('OTP hashes are domain-separated from signup, reset, other account and new phone', () => {
  const otp = createOtpCrypto(env), id = 'phone-change:7:abc', phone = '+998901234567', issue = otp.issue(phone, id);
  assert.match(issue.code, /^\d{5}$/);assert.notEqual(issue.hash, issue.code);
  const row = { id, phone, otp_hmac_hash: issue.hash, otp_hmac_key_id: issue.keyId, otp_issuance_nonce: issue.nonce };
  assert.ok(otp.matches(row, issue.code));
  for (const id of ['abc', 'password-reset:abc', 'phone-change:8:abc']) assert.equal(otp.matches({ ...row, id }, issue.code), false);
  assert.equal(otp.matches({ ...row, phone: '+998901234568' }, issue.code), false);
});
test('controller fails closed, never returns driver secrets, rejects admin before storage', async () => {
  const response = () => ({ set() {}, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
  for (const code of ['42P01', '23505']) {
    const controller = createPhoneChangeController({ env, pool: { query: async () => ({ rows: [{ request_count: 1 }] }) }, service: { start: async () => { throw Object.assign(Error('private-OTP-password'), { code, detail: 'secret-phone' }); } } });
    const res = response();await controller.start({ user: { role: 'customer' }, socket: {}, body: {} }, res);
    assert.equal(res.statusCode, code === '23505' ? 409 : 503);assert.doesNotMatch(JSON.stringify(res.body), /private|secret/);
    const admin = response();await controller.start({ user: { role: 'admin' } }, admin);assert.equal(admin.statusCode, 403);
  }
});
test('phone-change /start and contacts never fall through to signup or booking link', async () => {
  const calls = [], replies = [];
  const handler = createUpdateHandler({ username: env.TELEGRAM_BOT_USERNAME, contacts: {}, api: async (_m, b) => replies.push(b),
    service: { consume() { assert.fail(); } }, registration: { contact() { assert.fail(); } },
    phoneChange: { open: async (_m, p) => calls.push(p), contact: async () => ({ body: { code: 'otp_sent' } }), clearChat: async () => calls.push('clear') } });
  const payload = 'pc_' + 'a'.repeat(48);
  await handler({ message: { ...message, contact: undefined, text: '/start ' + payload } });
  await handler({ message });
  assert.deepEqual(calls, [payload]);assert.equal(replies[0].reply_markup.keyboard[0][0].request_contact, true);
  await handler({ message: { ...message, contact: undefined, text: '/start' } });assert.deepEqual(calls, [payload, 'clear']);
});
test('unauthenticated service call never verifies password or writes credentials', async () => {
  let checked = false;
  const client = { query: async () => ({ rows: [] }), release() {} };
  const service = createPhoneChangeService({ env, pool: { connect: async () => client }, passwords: { verifyPassword: async () => { checked = true; } } });
  await assert.rejects(service.start({ password: 'irrelevant' }, null, '127.0.0.1'), { code: 'phone_change_expired' });assert.equal(checked, false);
});
