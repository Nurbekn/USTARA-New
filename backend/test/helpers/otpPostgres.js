const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { Client, Pool } = require('pg');

const backend = path.resolve(__dirname, '../..');
const binaries = '/usr/lib/postgresql/16/bin';
const migrations = ['20261113_00_users_foundation.sql', '20261113_unified_accounts.sql',
  '20261113_unified_accounts_02_admin_accounts.sql', '20261114_otp_registration.sql',
  '20261114_otp_registration_02_profile_names.sql', '20261114_otp_registration_03_barber_specialty.sql',
  '20261114_security_01_login_protection.sql', '20261114_security_02_password_reset.sql',
  '20261114_slots_01_booking_duration.sql', '20261114_telegram_01_barber_links.sql',
  '20261119_telegram_otp_delivery.sql', '20261120_telegram_registration_requests.sql',
  '20261121_telegram_auth_hardening.sql'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function protectedHashes() {
  const result = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile() && /\.(js|jsx|sql|md)$/.test(entry.name)) result[filename] = hash(fs.readFileSync(filename));
    }
  }
  walk(backend);
  return result;
}

async function createOtpPostgresHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ustara_otp_pg16_'));
  fs.chmodSync(root, 0o700);
  const data = path.join(root, 'data');
  const socket = path.join(root, 'socket');
  const httpSocket = path.join(root, 'http.sock');
  fs.mkdirSync(socket, { mode: 0o700 });
  fs.mkdirSync(path.join(root, 'inputs'));
  const initialHashes = protectedHashes();
  const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
  write('protected-input-hashes.json', initialHashes);
  const role = 'ustara_otp_test';
  const database = 'ustara_test_db';
  const port = 55468;
  const report = { root, cases: {}, parallel: [], database, role, socket, port,
    mocking: { sql: false, transactions: false, clock: false, passwordHashing: false, jwt: false,
      sms: 'production non-network test adapter', dbModule: 'real pg.Pool bound without executing db.js/dotenv' } };
  const connections = new Set();
  let started = false;
  let server;
  let pool;
  let boundDb;
  const savedEnv = {};
  let observer;
  let admin;
  function command(name, args, logName) {
    const result = spawnSync(path.join(binaries, name), args, { encoding: 'utf8', timeout: 30000 });
    fs.writeFileSync(path.join(root, logName), (result.stdout || '') + (result.stderr || ''));
    assert.equal(result.status, 0, `${name} must succeed; see private setup log`);
    return result.stdout;
  }
  async function connect(db = database, application = 'ustara_otp_test_control') {
    // No connection URL, PG defaults, project db.js, dotenv or production server.
    const client = new Client({ host: socket, port, user: role, password: '', database: db,
      ssl: false, application_name: application, connectionTimeoutMillis: 5000,
      options: '-c timezone=UTC -c search_path=public' });
    connections.add(client);
    await client.connect();
    const identity = (await client.query(`SELECT current_database() AS database,session_user,current_user AS role,
      current_setting('data_directory') AS data_directory,current_setting('server_version') AS version,
      current_setting('server_version_num')::int AS version_num,
      current_setting('listen_addresses') AS listen_addresses,inet_server_addr() AS address`)).rows[0];
    assert.equal(identity.database, db);
    assert.equal(identity.session_user, role);
    assert.equal(identity.role, role);
    assert.equal(fs.realpathSync(identity.data_directory), fs.realpathSync(data));
    assert.ok(identity.version_num >= 160000 && identity.version_num < 170000);
    assert.equal(identity.listen_addresses, '');
    assert.equal(identity.address, null);
    report.identity = identity;
    return client;
  }
  async function close() {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    for (const client of connections) { try { await client.end(); } catch {} }
    if (boundDb) delete require.cache[boundDb];
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (started) {
      const stopped = spawnSync(path.join(binaries, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8', timeout: 30000 });
      fs.writeFileSync(path.join(root, 'shutdown.log'), (stopped.stdout || '') + (stopped.stderr || ''));
      report.serverStopped = stopped.status === 0 && !fs.existsSync(path.join(data, 'postmaster.pid'));
    }
    report.protectedInputsUnchanged = Object.entries(initialHashes).every(([filename, digest]) => hash(fs.readFileSync(filename)) === digest);
    report.totalPass = Object.values(report.cases).filter((item) => item.status === 'PASS').length;
    report.totalFail = Object.values(report.cases).filter((item) => item.status === 'FAIL').length;
    write('report.json', report);
    assert.equal(report.protectedInputsUnchanged, true, 'production/migration/existing test files must remain unchanged');
    if (started) assert.equal(report.serverStopped, true, 'disposable server must stop');
  }
  try {
    const version = command('postgres', ['--version'], 'binary-version.log').trim();
    assert.match(version, /PostgreSQL\) 16\./);
    write('disposable-identity.json', { root, data, socket, port, role, database, binaryVersion: version });
    command('initdb', ['-D', data, '--username=' + role, '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8', '--no-sync'], 'initdb.log');
    // Never log bind parameters or error row details (OTP/token/password hashes).
    const options = `-c listen_addresses='' -c unix_socket_directories='${socket}' -c unix_socket_permissions=0700 -p ${port} -c shared_buffers=16MB -c max_connections=24 -c log_statement=none -c log_error_verbosity=terse -c log_parameter_max_length=0 -c log_parameter_max_length_on_error=0`;
    command('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', options, '-w', 'start'], 'startup.log');
    started = true;
    const bootstrap = await connect('postgres');
    await bootstrap.query(`CREATE DATABASE ${database}`);
    await bootstrap.end(); connections.delete(bootstrap);
    admin = await connect();
    observer = await connect(database, 'ustara_otp_test_observer');
    const fixture = path.join(backend, 'test/fixtures/pre_otp_schema.sql');
    fs.copyFileSync(fixture, path.join(root, 'inputs/pre_otp_schema.sql'));
    await admin.query(fs.readFileSync(fixture, 'utf8'));
    for (const filename of migrations) {
      const source = path.join(backend, 'database/migrations', filename);
      fs.copyFileSync(source, path.join(root, 'inputs', filename));
      await admin.query(fs.readFileSync(source, 'utf8'));
    }
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM public.ustara_schema_migrations')).rows[0].n, 13);
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('customers','barbers') AND column_name='name'")).rows[0].n, 0);
    const config = { NODE_ENV: 'test', OTP_SMS_ADAPTER: 'test', OTP_EXPOSE_CODE: 'true',
      OTP_HMAC_KEY: crypto.randomBytes(48).toString('hex'), OTP_HMAC_KEY_ID: 'pg16-integration',
      JWT_SECRET: crypto.randomBytes(48).toString('hex'), ADMIN_LOGIN: 'isolated-admin',
      ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex') };
    for (const [key, value] of Object.entries(config)) { savedEnv[key] = process.env[key]; process.env[key] = value; }
    pool = new Pool({ host: socket, port, user: role, password: '', database, ssl: false,
      max: 12, application_name: 'ustara_otp_service_worker', connectionTimeoutMillis: 5000,
      options: '-c timezone=UTC -c search_path=public' });
    report.poolBackendPids = [];
    pool.on('connect', (client) => { report.poolBackendPids.push(client.processID); });
    pool.on('error', (error) => { report.poolErrorCodes ||= []; report.poolErrorCodes.push(error.code || 'unknown'); });
    const dbPath = require.resolve('../../db');
    assert.equal(require.cache[dbPath], undefined, 'real db.js must not have executed');
    // Configuration binding only: every query goes unchanged to real PostgreSQL.
    // No query, row, connection, transaction or lock result is synthesized.
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
    boundDb = dbPath;
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../../routes/auth'));
    app.use('/api/admin', require('../../routes/admin'));
    app.use('/api/customers', require('../../routes/customers'));
    app.use('/api/barbers', require('../../routes/barbers'));
    server = http.createServer(app);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(httpSocket, resolve); });
    async function call(endpoint, body, token) {
      // Request/response bodies and auth headers are deliberately never logged.
      return new Promise((resolve, reject) => {
        const encoded = JSON.stringify(body);
        const request = http.request({ socketPath: httpSocket, path: endpoint, method: 'POST', agent: false,
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded),
            ...(token ? { authorization: 'Bearer ' + token } : {}) } }, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            try { resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
            catch { reject(new Error('Invalid JSON response; body suppressed')); }
          });
        });
        request.setTimeout(15000, () => request.destroy(new Error('Isolated HTTP request timed out')));
        request.on('error', reject); request.end(encoded);
      });
    }
    const start = (phone, role = 'customer') => call('/api/auth/registration/start', { phone, role, password: 'Pg16TestPass123', ...(role === 'barber' ? { specialty: 'barber' } : {}) });
    async function ageOtp(phone) {
      // Fixture preparation only: real server time/checks remain unchanged.
      await admin.query('BEGIN');
      try {
        const sent = (await admin.query("SELECT date_trunc('milliseconds',clock_timestamp()) - INTERVAL '181 seconds' AS sent")).rows[0].sent;
        await admin.query(`UPDATE pending_registrations SET created_at=least(created_at,$2::timestamptz),
          otp_sent_at=$2,otp_expires_at=$2::timestamptz+INTERVAL '3 minutes' WHERE phone=$1`, [phone, sent]);
        await admin.query(`UPDATE registration_otp_history SET sent_at=$2,
          expires_at=$2::timestamptz+INTERVAL '3 minutes' WHERE phone=$1 AND invalidated_at IS NULL AND verified_at IS NULL`, [phone, sent]);
        await admin.query('UPDATE registration_phone_limits SET last_sent_at=$2 WHERE phone=$1', [phone, sent]);
        await admin.query('COMMIT');
      } catch (error) { await admin.query('ROLLBACK'); throw error; }
    }
    async function state(phone) {
      const result = {};
      for (const table of ['registration_phone_limits', 'pending_registrations', 'registration_otp_history', 'registration_security_events', 'registration_admin_actions', 'users', 'customers', 'barbers']) {
        const filter = ['customers', 'barbers'].includes(table) ? 'user_id IN (SELECT id FROM users WHERE phone=$1)' : 'phone=$1';
        const ordering = table === 'registration_phone_limits' ? 'r.phone' : 'r.id';
        result[table] = (await observer.query(`SELECT count(*)::int AS count,
          md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY ${ordering})::text,'[]')) AS fingerprint
          FROM public.${table} r WHERE ${filter}`, [phone])).rows[0];
      }
      return result; // Fingerprints only, no credentials or credential hashes.
    }
    async function fault(table, field, value, work) {
      assert.ok(['customers', 'barbers', 'registration_otp_history', 'registration_admin_actions', 'registration_security_events'].includes(table));
      assert.ok(['first_name', 'action_type', 'event_type'].includes(field));
      assert.match(value, /^[a-zA-Z_]+$/);
      const functionName = 'otp_integration_fault';
      await admin.query(`CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.${field}='${value}' THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='injected integration fault'; END IF; RETURN NEW; END $$`);
      try {
        await admin.query(`CREATE TRIGGER otp_integration_fault BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`);
        await work();
      } finally {
        await admin.query(`DROP TRIGGER IF EXISTS otp_integration_fault ON public.${table}`);
        await admin.query(`DROP FUNCTION public.${functionName}()`);
      }
    }
    async function parallel(label, phone, requests) {
      const holder = await connect(database, 'ustara_otp_test_lock_holder');
      await holder.query('BEGIN');
      await holder.query('SELECT phone FROM registration_phone_limits WHERE phone=$1 FOR UPDATE', [phone]);
      const batch = Promise.all(requests.map((request) => request()));
      // Attach rejection handling immediately; never print request/response data.
      batch.catch(() => {});
      let observed;
      try {
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          const rows = (await observer.query(`SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers
            FROM pg_catalog.pg_stat_activity WHERE datname=$1 AND application_name='ustara_otp_service_worker'
            AND state='active' AND wait_event_type='Lock' ORDER BY pid`, [database])).rows;
          if (new Set(rows.map((row) => row.pid)).size >= requests.length) { observed = rows; break; }
          await wait(30);
        }
      } finally {
        await holder.query('ROLLBACK');
        await holder.end(); connections.delete(holder);
      }
      const results = await batch;
      assert.ok(observed, `${label}: real independent waiting backends must be observed`);
      report.parallel.push({ label, participants: requests.length, backendPids: observed.map((row) => row.pid),
        waitEvents: observed.map(({ wait_event_type, wait_event }) => ({ wait_event_type, wait_event })), statuses: results.map((row) => row.status).sort((a, b) => a - b) });
      write('parallel-evidence.json', report.parallel);
      return results;
    }
    function record(name, status, evidence = {}) {
      report.cases[name] = { status, ...evidence }; write('report.json', report);
    }
    return { root, report, admin, observer, pool, call, start, ageOtp, state, fault, parallel, record, close,
      adminCredentials: { login: config.ADMIN_LOGIN, password: config.ADMIN_PASSWORD } };
  } catch (error) {
    // No secret-bearing driver detail/parameters or environment values.
    report.setupFailure = { code: error.code || null, message: 'Disposable setup failed; see private setup logs' };
    await close();
    throw new Error('Cannot safely prepare isolated PostgreSQL 16; artifacts: ' + root);
  }
}

module.exports = { createOtpPostgresHarness };
