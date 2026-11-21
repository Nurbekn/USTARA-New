const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { testTarget, assertTestConnection } = require('./testDatabaseTarget');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function createLoginHarness() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.USTARA_LOGIN_WRITE_TESTS, 'I_AUTHORIZE_TEST_DATA');
  const target = testTarget(process.env.USTARA_TEST_DATABASE_URL, 'Login testi', ['ustara_login_test']);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.USTARA_TEST_DATABASE_URL, ssl: false, max: 16 });
  await assertTestConnection(pool, target);
  const express = require('express');
  // Inject only the verified test pool before loading the real router. db.js
  // and server.js deliberately never execute, so dotenv cannot read .env.
  const dbPath = require.resolve('../../db');
  const previousDb = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const { createRoleLogin, createAdminLogin } = require('../../services/loginAuthentication');
  const password = 'LoginIntegration123';
  const adminLogin = 'login-test-admin';
  let adminUsed = false;
  const app = express();
  const requests = [];
  app.use(require('cors')({ exposedHeaders: ['Retry-After'] }));
  app.use(express.json());
  app.use((req, res, next) => {
    const path = req.originalUrl;
    if (req.path.endsWith('/login')) res.once('finish', () => requests.push({ path, status: res.statusCode }));
    next();
  });
  app.use('/api/auth', require('../../routes/auth'));
  app.post('/api/customers/login', createRoleLogin('customer', pool));
  app.post('/api/barbers/login', createRoleLogin('barber', pool));
  app.post('/api/admin/login', (_req, _res, next) => { adminUsed = true; next(); },
    createAdminLogin(pool, { ADMIN_LOGIN: adminLogin, ADMIN_PASSWORD: password, JWT_SECRET: process.env.JWT_SECRET }));
  app.get('/api/admin/overview', (req, res) => {
    try {
      const claims = require('jsonwebtoken').verify(req.headers.authorization?.slice(7), process.env.JWT_SECRET);
      assert.equal(claims.role, 'admin');
      res.json({ users: { customer: 0, barber: 0 } });
    } catch { res.status(401).json({ message: 'Test admin sessiyasi yaroqsiz' }); }
  });
  // Record only paths and statuses, never credentials or tokens.
  app.use((_req, res) => res.status(404).json({ message: 'Test endpoint topilmadi' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const phones = [], users = [], keys = new Set();
  const { hashPassword } = require('../../utils/passwordPolicy');
  const passwordHash = await hashPassword(password);
  async function freshPhone() {
    let phone;
    do { phone = '+99890' + String(crypto.randomInt(1000000, 9999999)); }
    while (phones.includes(phone) || (await pool.query('SELECT 1 FROM users WHERE phone=$1', [phone])).rowCount);
    phones.push(phone);
    keys.add(hash(phone));
    keys.add(hash(JSON.stringify([phone, '127.0.0.1'])));
    return phone;
  }
  async function account(role = 'customer') {
    const phone = await freshPhone(), client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = (await client.query('INSERT INTO users(phone,password,role) VALUES($1,$2,$3) RETURNING id', [phone, passwordHash, role])).rows[0];
      const profile = (await client.query(`INSERT INTO ${role === 'customer' ? 'customers' : 'barbers'}
        (user_id,first_name,last_name${role === 'barber' ? ',specialty' : ''})
        VALUES($1,'Sinov','Login'${role === 'barber' ? ",'stylist'" : ''}) RETURNING id`, [user.id])).rows[0];
      await client.query('COMMIT');
      users.push({ id: user.id, phone });
      return { phone, userId: user.id, profileId: profile.id, role };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function call(phone, suppliedPassword = password, path = '/api/auth/login') {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password: suppliedPassword }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function close() {
    await new Promise(resolve => server.close(resolve));
    try {
      await assertTestConnection(pool, target);
      for (const user of users) await pool.query('DELETE FROM users WHERE id=$1 AND phone=$2', [user.id, user.phone]);
      await pool.query("DELETE FROM login_attempt_limits WHERE scope='public' AND key_hash=ANY($1::text[])", [[...keys]]);
      if (adminUsed) await pool.query("DELETE FROM login_attempt_limits WHERE scope='admin' AND key_hash=ANY($1::text[])",
        [[hash('singleton-admin'), hash('127.0.0.1')]]);
    } finally {
      await pool.end();
      if (previousDb) require.cache[dbPath] = previousDb; else delete require.cache[dbPath];
      if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    }
  }
  async function callAdmin(suppliedPassword = password) {
    const response = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: adminLogin, password: suppliedPassword }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { pool, base, call, callAdmin, adminLogin, account, freshPhone, close, password, hash, keys, requests };
}
module.exports = { createLoginHarness };
