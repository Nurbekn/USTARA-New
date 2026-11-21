'use strict';
// v206: require an empty disposable database AFTER the real concurrency test.
// This is an independent read-only postflight: no DELETE, TRUNCATE or repair.
// Never print fixture payloads, full URLs, secrets or row counts.
const { checkIsolatedDbGate } = require('./v193-isolated-db-gate.cjs');
const { EMPTY_TABLES } = require('./v205-empty-fixtures-proof.cjs');

// v207: the exact same 14 fixture tables must be empty both BEFORE and
// AFTER the integration test. Keep a separate frozen export for the postrun
// proof to prevent accidental mutation by consumers.
const POSTRUN_TABLES = Object.freeze([...EMPTY_TABLES]);

function buildPostrunSnapshotSql() {
  if (POSTRUN_TABLES.length !== new Set(POSTRUN_TABLES).size ||
      POSTRUN_TABLES.some(name => !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error('v206: invalid source-controlled table allowlist');
  }
  const checks = POSTRUN_TABLES.map(name =>
    `EXISTS (SELECT 1 FROM public.${name} LIMIT 1) AS ${name}`);
  return `SELECT current_database() AS database, session_user, current_user,\n` +
    `       current_schema() AS schema,\n` +
    `       current_setting('transaction_read_only') AS read_only,\n` +
    `       ${checks.join(',\n       ')}`;
}

function verifyPostrunSnapshot(snapshot) {
  const keys = ['database', 'session_user', 'current_user', 'schema', 'read_only', ...POSTRUN_TABLES];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      JSON.stringify(Object.keys(snapshot).sort()) !== JSON.stringify(keys.sort()) ||
      snapshot.database !== 'ustara_test_db' ||
      snapshot.session_user !== 'ustara_account_test' ||
      snapshot.current_user !== 'ustara_account_test' ||
      snapshot.schema !== 'public' || snapshot.read_only !== 'on' ||
      POSTRUN_TABLES.some(name => snapshot[name] !== false)) {
    throw new Error('v206: disposable database cleanup is incomplete or identity changed');
  }
  return Object.freeze({database: 'ustara_test_db', checkedTables: POSTRUN_TABLES.length,
    empty: true, readOnly: true});
}

async function runPostrunCleanupProof(env = process.env, injectedPool) {
  // Validate *before* building a pool or attempting any network operation.
  checkIsolatedDbGate(env);
  const ownPool = !injectedPool;
  const pool = injectedPool || new (require('pg').Pool)({
    connectionString: env.USTARA_TEST_DATABASE_URL,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
    application_name: 'ustara_v206_postrun_cleanup_read_only',
  });
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    begun = true;
    const result = await client.query(buildPostrunSnapshotSql());
    if (!result || result.rows?.length !== 1) {
      throw new Error('v206: missing or ambiguous postrun snapshot');
    }
    const proof = verifyPostrunSnapshot(result.rows[0]);
    await client.query('ROLLBACK');
    begun = false;
    return proof;
  } finally {
    if (client) {
      if (begun) await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (ownPool) await pool.end();
  }
}

if (require.main === module) {
  runPostrunCleanupProof()
    .then(({checkedTables}) => console.log(`v206 postrun cleanup PASS: ${checkedTables} test tables empty; read-only`))
    .catch(() => {
      console.error('v206 postrun cleanup BLOCKED/FAILED (evidence upload is not authorized)');
      process.exitCode = 1;
    });
}

module.exports = {
  POSTRUN_TABLES,
  buildPostrunSnapshotSql,
  verifyPostrunSnapshot,
  runPostrunCleanupProof,
};
