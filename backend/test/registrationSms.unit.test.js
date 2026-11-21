const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEskizSmsAdapter } = require('../services/registrationSms');
const env = { NODE_ENV: 'development', ESKIZ_EMAIL: 'private@example.invalid',
  ESKIZ_PASSWORD: 'PRIVATE_PASSWORD', ESKIZ_FROM: 'PRIVATE_SENDER',
  ESKIZ_SMS_TEMPLATE: 'PRIVATE_TEMPLATE {code}' };
const privatePayload = { message: 'PRIVATE_PASSWORD PRIVATE_OTP PRIVATE_PHONE', data: { token: 'PRIVATE_TOKEN' } };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
function fixture(replies) {
  const logs = [], calls = [];
  const adapter = createEskizSmsAdapter(env, async (...args) => {
    calls.push(args);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, 'Unexpected provider request');
    return next;
  }, { error(...args) { logs.push(args); } });
  return { adapter, logs, calls };
}
const send = adapter => adapter.send({ phone: '+998901234567', code: '12345' });
for (const [name, replies, detail] of [
  ['authentication rejection', [reply(401, privatePayload)], { stage: 'authenticate', status: 401, reason: 'provider_rejected' }],
  ['missing authentication token', [reply(200, { message: 'PRIVATE_PASSWORD' })], { stage: 'authenticate', status: 200, reason: 'invalid_response' }],
  ['SMS rejection', [reply(200, privatePayload), reply(400, privatePayload)], { stage: 'send', status: 400, reason: 'provider_rejected' }],
  ['authentication timeout', [Object.assign(new Error('PRIVATE_PASSWORD'), { name: 'TimeoutError' })], { stage: 'authenticate', status: null, reason: 'timeout' }],
  ['send network failure', [reply(200, privatePayload), new Error('PRIVATE_PASSWORD')], { stage: 'send', status: null, reason: 'network_error' }],
]) {
  test(`${name} records safe diagnostics and preserves public error contract`, async () => {
    const f = fixture(replies);
    await assert.rejects(send(f.adapter), { status: 503, code: 'sms_unavailable' });
    assert.deepEqual(f.logs, [['eskiz_sms_failed', detail]]);
    assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE_|12345|998901234567/);
  });
}
test('success caches token and emits no failure diagnostics', async () => {
  const f = fixture([reply(200, privatePayload), reply(200, { status: 'waiting' }), reply(200, { status: 'waiting' })]);
  await send(f.adapter);
  await send(f.adapter);
  assert.equal(f.calls.length, 3);
  assert.deepEqual(f.logs, []);
  assert.equal(f.adapter.exposeCode(), false);
});
test('expired bearer token is refreshed once without logging secrets', async () => {
  const f = fixture([reply(200, privatePayload), reply(401, privatePayload), reply(200, privatePayload), reply(200, { status: 'waiting' })]);
  await send(f.adapter);
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.logs, []);
});
