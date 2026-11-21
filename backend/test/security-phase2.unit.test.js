const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseOrigins, createOriginPolicy } = require('../middleware/originPolicy');
const { createSessionsController } = require('../controllers/sessionsController');

function mockResponse() {
  return { statusCode: 200, headers: {}, payload: null,
    set(k, v) { this.headers[k] = v; return this; },
    vary(k) { this.headers.Vary = k; return this; },
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
  };
}

test('production CORS requires exact allowlist and blocks foreign browser origins', () => {
  assert.throws(() => createOriginPolicy({ NODE_ENV: 'production' }), /CORS_ALLOWED_ORIGINS/);
  const policy = createOriginPolicy({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://ustara.uz,https://www.ustara.uz' });
  const blocked = mockResponse();
  let called = false;
  policy.guard({ headers: { origin: 'https://fake-ustara.uz' } }, blocked, () => { called = true; });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.payload.code, 'origin_forbidden');
  assert.equal(called, false);
  const accepted = mockResponse();
  policy.guard({ headers: { origin: 'https://ustara.uz' } }, accepted, () => { called = true; });
  assert.equal(called, true);
  let headerValue;
  policy.corsOptions.origin('https://ustara.uz', (_err, value) => { headerValue = value; });
  assert.equal(headerValue, 'https://ustara.uz');
  // Telegram and CLI requests do not send Origin; they remain valid.
  called = false;
  policy.guard({ headers: {} }, mockResponse(), () => { called = true; });
  assert.equal(called, true);
});

test('CORS allows local development, rejects wildcard and malformed production entries', () => {
  assert.deepEqual(parseOrigins('https://ustara.uz,https://ustara.uz'), ['https://ustara.uz']);
  for (const invalid of ['*', 'https://ustara.uz/path', 'https://ustara.uz/', 'https://user:password@ustara.uz', 'ftp://host']) {
    assert.throws(() => parseOrigins(invalid));
  }
  let next = false;
  createOriginPolicy({ NODE_ENV: 'development' }).guard({headers: { origin: 'http://localhost:5173' }}, mockResponse(), () => {next = true;});
  assert.equal(next, true);
});

test('revoke-all increments version atomically and invalidates previous session', async () => {
  let sql = '', params;
  const controller = createSessionsController({ pool: { async query(query, args) {
    sql = query; params = args;
    return { rowCount: 1, rows: [{version: 4}] };
  } } });
  const result = mockResponse();
  await controller.revokeAll({user: {role: 'customer', accountId: 12, sessionVersion: 3}}, result);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.code, 'sessions_revoked');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(params, [12, 3]);
  assert.match(sql, /WHERE account_session_versions.version=\$2/);
  assert.match(sql, /RETURNING version/);
});

test('revoke-all fails closed for forged role, stale session and storage outage', async () => {
  let queries = 0;
  const stale = createSessionsController({pool: {async query() { queries++; return {rowCount: 0}; }}});
  const wrong = mockResponse();
  await stale.revokeAll({user: {role: 'admin', accountId: 1}}, wrong);
  assert.equal(wrong.statusCode, 403);
  assert.equal(queries, 0);
  const staleResponse = mockResponse();
  await stale.revokeAll({user: {role: 'barber', accountId: 9, sessionVersion: 1}}, staleResponse);
  assert.equal(staleResponse.statusCode, 401);
  const error = createSessionsController({ pool: {async query() {throw new Error('password/token should stay private');}}});
  const unavailable = mockResponse();
  await error.revokeAll({user: {role: 'customer', accountId: 8, sessionVersion: 0}}, unavailable);
  assert.equal(unavailable.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(unavailable.payload), /password\/token/);
});

test('JWT verification rejects non-HS256 tokens before querying any account', async () => {
  const jwt = require('jsonwebtoken');
  // Instantiating pg Pool never opens a connection; use inert configuration.
  const testKeys = { DB_HOST: '127.0.0.1', DB_PORT: '5432', DB_NAME: 'local_unit_dummy', DB_USER: 'unit', DB_PASSWORD: 'unit' };
  const previousDb = Object.fromEntries(Object.keys(testKeys).map(k => [k, process.env[k]]));
  const previous = process.env.JWT_SECRET;
  Object.assign(process.env, testKeys);
  process.env.JWT_SECRET = 'phase2-unit-test-key-not-a-real-secret';
  const auth = require('../middleware/authMiddleware');
  try {
    const token = jwt.sign({id: 10, role: 'customer', profileId: 7, sessionVersion: 0}, process.env.JWT_SECRET,
      { algorithm: 'HS384', expiresIn: '1h' });
    const response = mockResponse();
    let next = false;
    await auth({headers: {authorization: `Bearer ${token}`}}, response, () => {next = true;});
    assert.equal(response.statusCode, 401);
    assert.equal(next, false);
    const second = mockResponse();
    await auth({headers: {authorization: `Bearer ${token} extra`}}, second, () => {next = true;});
    assert.equal(second.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
    for (const [key, value] of Object.entries(previousDb)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
