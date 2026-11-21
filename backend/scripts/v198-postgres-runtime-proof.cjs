'use strict';
// Validate the actual disposable PostgreSQL runtime before running write tests.
// Read-only transaction; the v193 isolated-database gate runs before any network activity.
const { checkIsolatedDbGate } = require('./v193-isolated-db-gate.cjs');
const { isIP } = require('node:net');

// In GitHub Actions the Node process reaches PostgreSQL through a Docker
// published loopback port. inet_server_addr() reports the server-side Docker
// bridge address (typically 172.17/16), NOT the client's 127.0.0.1 URL.
// This is only a consistency check: the actual client target is restricted by
// checkIsolatedDbGate() before opening any TCP connection.
function isPrivateServerAddress(address) {
  if (typeof address !== 'string') return false;
  if (isIP(address) === 4) {
    const [a, b, c, d] = address.split('.').map(Number);
    // Reject wildcard, multicast and publicly routed endpoints. Docker may
    // use any RFC1918 bridge subnet; the exact IP is not predetermined.
    return (a === 127 || a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)) &&
      !(a === 127 && b === 0 && c === 0 && d === 0);
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || /^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized);
  }
  return false;
}

function verifyRuntimeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('v198: runtime snapshot missing');
  }
  if (snapshot.database !== 'ustara_test_db' ||
      snapshot.session_user !== 'ustara_account_test' ||
      snapshot.current_user !== 'ustara_account_test' ||
      snapshot.database_owner !== 'ustara_account_test' ||
      !Number.isInteger(snapshot.server_version_num) ||
      snapshot.server_version_num < 180000 || snapshot.server_version_num >= 190000 ||
      snapshot.is_superuser !== false || snapshot.can_create_db !== false ||
      snapshot.can_create_role !== false || snapshot.can_replicate !== false ||
      snapshot.can_bypass_rls !== false || snapshot.can_login !== true ||
      snapshot.in_recovery !== false || snapshot.read_only !== 'on' ||
      snapshot.btree_gist_public !== true || !isPrivateServerAddress(snapshot.server_addr)) {
    throw new Error('v198: unsafe or unexpected PostgreSQL test runtime');
  }
  return { version: 18, database: 'ustara_test_db', role: 'ustara_account_test', readOnly: true };
}

async function runRuntimeProof(env = process.env, injectedPool) {
  checkIsolatedDbGate(env);
  const ownPool = !injectedPool;
  const pool = injectedPool || new (require('pg').Pool)({
    connectionString: env.USTARA_TEST_DATABASE_URL, ssl: false, max: 1,
    connectionTimeoutMillis: 5000, statement_timeout: 8000,
    application_name: 'ustara_v198_runtime_read_only',
  });
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    begun = true;
    const result = await client.query(`
      SELECT current_database() AS database, session_user, current_user,
             (SELECT pg_get_userbyid(datdba) FROM pg_catalog.pg_database WHERE datname = current_database()) AS database_owner,
             current_setting('server_version_num')::integer AS server_version_num,
             r.rolsuper AS is_superuser, r.rolcreatedb AS can_create_db,
             r.rolcreaterole AS can_create_role, r.rolreplication AS can_replicate,
             r.rolbypassrls AS can_bypass_rls, r.rolcanlogin AS can_login,
             pg_catalog.pg_is_in_recovery() AS in_recovery,
             current_setting('transaction_read_only') AS read_only,
             host(pg_catalog.inet_server_addr()) AS server_addr,
             EXISTS (SELECT 1 FROM pg_catalog.pg_extension e
                     JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
                     WHERE e.extname = 'btree_gist' AND n.nspname = 'public') AS btree_gist_public
        FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
    `);
    if (result.rows.length !== 1) throw new Error('v198: unexpected role lookup');
    const verified = verifyRuntimeSnapshot(result.rows[0]);
    await client.query('ROLLBACK');
    begun = false;
    return verified;
  } finally {
    if (client) {
      if (begun) await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (ownPool) await pool.end();
  }
}

if (require.main === module) {
  runRuntimeProof().then(() => console.log('v198 PostgreSQL runtime proof PASS: isolated PostgreSQL 18, least-privilege role'))
    .catch(() => { console.error('v198 PostgreSQL runtime proof BLOCKED/FAILED'); process.exitCode = 1; });
}
module.exports = { isPrivateServerAddress, verifyRuntimeSnapshot, runRuntimeProof };
