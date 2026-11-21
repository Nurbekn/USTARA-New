'use strict';
// v205: after bootstrap and before any mutating booking test, prove the
// disposable database has no existing account, booking or notification rows.
// This is a read-only, fail-closed preflight. It never enumerates or prints data.
// In production the v193 gate must reject all attempted connections.
const { checkIsolatedDbGate } = require('./v193-isolated-db-gate.cjs');

// Only source-controlled literal identifiers may enter the SQL text.
// The singleton admin account and smart_booking_admin_settings are intentional
// bootstrap seed rows and are deliberately NOT included in this list.
const EMPTY_TABLES = Object.freeze([
  'users',
  'customers',
  'barbers',
  'services',
  'bookings',
  'booking_services',
  'barber_working_hours',
  'barber_weekly_breaks',
  'barber_date_breaks',
  'booking_checkins',
  'customer_telegram_links',
  'customer_booking_telegram_outbox',
  // v207: these account/booking-owned rows are also checked postrun.
  // An already dirty fixture must be rejected BEFORE concurrency writes.
  'booking_request_keys',
  'customer_telegram_link_tokens',
]);

function buildSnapshotSql() {
  if (new Set(EMPTY_TABLES).size !== EMPTY_TABLES.length ||
      EMPTY_TABLES.some(name => !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error('v205: unsafe preflight table list');
  }
  const flags = EMPTY_TABLES.map(name =>
    `EXISTS (SELECT 1 FROM public.${name} LIMIT 1) AS ${name}`);
  return `SELECT current_database() AS database, session_user, current_user,\n` +
    `       current_schema() AS schema,\n` +
    `       current_setting('transaction_read_only') AS read_only,\n` +
    `       ${flags.join(',\n       ')}`;
}

function verifyEmptySnapshot(snapshot) {
  const expected = ['database', 'session_user', 'current_user', 'schema', 'read_only', ...EMPTY_TABLES];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      JSON.stringify(Object.keys(snapshot).sort()) !== JSON.stringify(expected.sort()) ||
      snapshot.database !== 'ustara_test_db' ||
      snapshot.session_user !== 'ustara_account_test' ||
      snapshot.current_user !== 'ustara_account_test' ||
      snapshot.schema !== 'public' || snapshot.read_only !== 'on' ||
      EMPTY_TABLES.some(name => snapshot[name] !== false)) {
    throw new Error('v205: disposable database identity or empty-fixture precondition failed');
  }
  return Object.freeze({ database: 'ustara_test_db', inspectedTables: EMPTY_TABLES.length, empty: true, readOnly: true });
}

async function runEmptyFixtureProof(env = process.env, injectedPool) {
  checkIsolatedDbGate(env); // Must run before a pool is created or a connection is opened.
  const ownPool = !injectedPool;
  const pool = injectedPool || new (require('pg').Pool)({
    connectionString: env.USTARA_TEST_DATABASE_URL,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
    application_name: 'ustara_v205_empty_fixtures_read_only',
  });
  let client;
  let begun = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY');
    begun = true;
    const result = await client.query(buildSnapshotSql());
    if (!result || result.rows?.length !== 1) {
      throw new Error('v205: missing or ambiguous preflight database snapshot');
    }
    const proof = verifyEmptySnapshot(result.rows[0]);
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
  runEmptyFixtureProof()
    .then(({inspectedTables}) => console.log(`v205 empty-fixture proof PASS: ${inspectedTables} tables empty; read-only check`))
    .catch(() => {
      console.error('v205 empty-fixture proof BLOCKED/FAILED (no fixture writes permitted)');
      process.exitCode = 1;
    });
}

module.exports = { EMPTY_TABLES, buildSnapshotSql, verifyEmptySnapshot, runEmptyFixtureProof };
