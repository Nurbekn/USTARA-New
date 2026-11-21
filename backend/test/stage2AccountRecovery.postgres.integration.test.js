'use strict';
// #84/#135/#140: exercise REAL PostgreSQL and the production auth/recovery
// services, but only in a caller-authorized, disposable, isolated test schema.
// This test NEVER uses app .env, production DB URLs, or networked Telegram.
// The harness validates the exact test database name, local connection,
// allowed non-superuser, schema ownership/OID and cleanup permissions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const enabled = process.env.NODE_ENV === 'test'
  && process.env.USTARA_ACCOUNT_INTEGRITY_TESTS === 'I_AUTHORIZE_TEST_DATABASE'
  && process.env.USTARA_STAGE2_SECURITY_TESTS === 'I_AUTHORIZE_STAGE2_DB_TEST';

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(body = {}) {
  return { body, headers: {'user-agent': 'Mozilla/5.0 (X11; Linux) Chrome/157.0.0.0'},
    socket: {remoteAddress: '127.0.0.1'} };
}

async function run(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

test('stage2: real database session / pause / reactivation / recovery lifecycle',
  { skip: !enabled, timeout: 180_000 }, async (t) => {
    const { createAccountIntegrityHarness } = require('./helpers/accountIntegrityHarness');
    const { hashPassword } = require('../utils/passwordPolicy');
    const { createRoleLogin } = require('../services/loginAuthentication');
    const { createAuthMiddleware } = require('../middleware/authMiddleware');
    const { createSessionsController } = require('../controllers/sessionsController');
    const { createAccountPauseController } = require('../controllers/accountPauseController');
    const { createManualAccountRecovery } = require('../services/manualAccountRecovery');
    const h = await createAccountIntegrityHarness();
    t.after(async () => h.close());
    const pool = h.pool;
    // This fixture cannot exist in production: account-test isolated schema.
    const phone = `+99893${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`;
    const unknownPhone = `+99894${String(crypto.randomInt(0, 10_000_000)).padStart(7, '0')}`;
    const password = 'TestStage2_' + crypto.randomBytes(12).toString('hex');
    const hash = await hashPassword(password);
    const client = await pool.connect();
    let userId;
    try {
      await client.query('BEGIN');
      const inserted = (await client.query(
        `INSERT INTO users(phone,password,role) VALUES($1,$2,'customer') RETURNING id,created_at`,
        [phone,hash])).rows[0];
      userId = inserted.id;
      await client.query(`INSERT INTO customers(user_id,first_name,last_name,created_at)
        VALUES($1,'Test','Foydalanuvchi',$2)`, [userId,inserted.created_at]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }

    const login = createRoleLogin('customer', pool);
    const authenticate = createAuthMiddleware({dbPool:pool});
    const sessions = createSessionsController({pool});
    const pause = createAccountPauseController({pool});
    async function logIn(extra = {}) {
      return run(login, request({phone,password,...extra}));
    }
    async function protectedUser(token) {
      let accepted = false;
      const req = {headers:{authorization:`Bearer ${token}`}};
      const res = response();
      await authenticate(req,res,() => { accepted = true; });
      return {accepted, req, res};
    }

    await t.test('sid is persisted; sign out invalidates only that device token', async () => {
      const result = await logIn();
      assert.equal(result.statusCode, 200);
      const token = result.body.token;
      const check = await protectedUser(token);
      assert.equal(check.accepted, true);
      assert.equal(check.req.user.accountId, userId);
      const devices = await run(sessions.list, {user:check.req.user});
      assert.equal(devices.statusCode, 200);
      assert.ok(devices.body.sessions.some(item => item.current === true));
      assert.ok(devices.body.sessions.every(item => !('token' in item)));
      const id = devices.body.sessions.find(item => item.current).id;
      const revoked = await run(sessions.revokeOne,
        {user:check.req.user,params:{id}});
      assert.equal(revoked.statusCode, 200);
      assert.equal((await protectedUser(token)).res.statusCode, 401);
    });

    await t.test('deactivation refuses old access and reactivation invalidates pre-pause JWT', async () => {
      const result = await logIn();
      assert.equal(result.statusCode, 200);
      const oldToken = result.body.token;
      const user = (await protectedUser(oldToken)).req.user;
      const paused = await run(pause.deactivate, {...request({password}),user});
      assert.equal(paused.statusCode, 200);
      assert.equal(paused.body.code, 'account_deactivated');
      assert.equal((await protectedUser(oldToken)).res.statusCode, 401);
      const denied = await logIn();
      assert.equal(denied.statusCode, 423);
      assert.equal(denied.body.code, 'account_deactivated');
      const restored = await logIn({reactivate:true});
      assert.equal(restored.statusCode, 200);
      assert.equal((await protectedUser(restored.body.token)).accepted, true);
      assert.equal((await protectedUser(oldToken)).res.statusCode, 401);
      const account = (await pool.query('SELECT deactivated_at FROM users WHERE id=$1',[userId])).rows[0];
      assert.equal(account.deactivated_at,null);
    });

    await t.test('recovery ticket and admin review never change credentials or grant login', async () => {
      const service = createManualAccountRecovery({ pool, env: {
        OTP_HMAC_KEY: crypto.randomBytes(48).toString('hex'),
      }});
      const before = (await pool.query('SELECT phone,password FROM users WHERE id=$1',[userId])).rows[0];
      const yes = await service.start({phone},'127.0.0.1');
      const no = await service.start({phone:unknownPhone},'127.0.0.1');
      assert.equal(yes.status,201); assert.equal(no.status,201);
      assert.equal(yes.body.message,no.body.message);
      assert.equal((await service.status({caseId:yes.body.caseId,ticketToken:yes.body.ticketToken},'127.0.0.1')).body.status,'open');
      await assert.rejects(service.status({caseId:yes.body.caseId,ticketToken:'0'.repeat(64)},'127.0.0.1'),
        {code:'recovery_ticket_unavailable'});
      await service.review({status:'reviewing',reason:'Sinov tekshiruvi'},yes.body.caseId,{id:1,role:'admin'});
      const count = (await pool.query('SELECT count(*)::int AS n FROM manual_recovery_events WHERE case_id=$1',
        [yes.body.caseId])).rows[0].n;
      assert.equal(count,2);
      assert.deepEqual((await pool.query('SELECT phone,password FROM users WHERE id=$1',[userId])).rows[0],before);
      const stored = (await pool.query('SELECT access_token_hash FROM manual_recovery_cases WHERE id=$1',
        [yes.body.caseId])).rows[0];
      assert.notEqual(stored.access_token_hash,yes.body.ticketToken);
    });

    const migrations = (await pool.query('SELECT version FROM ustara_schema_migrations ORDER BY version')).rows;
    for (const id of ['20261126_account_pause','20261127_manual_account_recovery','20261128_device_sessions']) {
      assert.ok(migrations.some(row => row.version === id), `missing ${id}`);
    }
  });

module.exports = { enabled, response, request };
