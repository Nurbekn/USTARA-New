'use strict';
// Read-only, opt-in PostgreSQL bootstrap proof for a disposable CI database.
// Importing this file never connects, loads .env, or requires pg.
const path = require('node:path');
const { readBootstrapPlan } = require('./bootstrap-plan');
const { checkIsolatedDbGate } = require('./v193-isolated-db-gate.cjs');

function expectedMigrationVersions() {
  const names = readBootstrapPlan()
    .filter(({ file }) => file.startsWith('migrations/'))
    .map(({ file }) => path.posix.basename(file, '.sql'));
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error('v194: empty or repeated migration plan');
  }
  return names.sort();
}

function verifyBootstrapSnapshot(snapshot, expectedVersions) {
  if (!snapshot || !Array.isArray(expectedVersions) || !expectedVersions.length) {
    throw new Error('v194: bootstrap verification input missing');
  }
  const expected = [...expectedVersions].sort();
  if (new Set(expected).size !== expected.length) throw new Error('v194: duplicate expected migrations');
  const actual = snapshot.versions;
  if (!Array.isArray(actual) || actual.some(version => typeof version !== 'string') ||
      actual.length !== expected.length ||
      JSON.stringify([...actual].sort()) !== JSON.stringify(expected)) {
    throw new Error('v194: applied migration history does not match the source bootstrap plan');
  }
  if (snapshot.database !== 'ustara_test_db' || snapshot.schema !== 'public' ||
      snapshot.session_user !== 'ustara_account_test' ||
      snapshot.current_user !== 'ustara_account_test' ||
      snapshot.is_superuser !== false || snapshot.can_create_db !== false ||
      snapshot.can_create_role !== false || snapshot.can_bypass_rls !== false ||
      snapshot.in_recovery !== false || snapshot.read_only !== 'on') {
    throw new Error('v194: unexpected database identity, privileges or read-only state');
  }
  if (snapshot.customer_exclusion !== true || snapshot.barber_exclusion !== true ||
      snapshot.checkins_table !== true || snapshot.customer_notices_table !== true ||
      snapshot.telegram_opt_in_table !== true || snapshot.btree_gist_public !== true) {
    throw new Error('v194: critical booking/notification schema protection missing');
  }
  return {database: snapshot.database, migrations: expected.length, readOnly: true, constraints: 'verified'};
}

async function runBootstrapProof(env = process.env, injectedPool) {
  checkIsolatedDbGate(env); // Before any attempted connection; rejects production-like variables.
  const expectedVersions = expectedMigrationVersions();
  const pool = injectedPool || new (require('pg').Pool)({ // Load pg only for the live CLI.
    connectionString: env.USTARA_TEST_DATABASE_URL,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
    application_name: 'ustara_v194_bootstrap_read_only',
  });
  let client, started = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN READ ONLY'); started = true;
    await client.query("SET LOCAL statement_timeout = '8s'");
    const identityResult = await client.query(`
      SELECT current_database() AS database,
             current_schema() AS schema,
             session_user, current_user,
             (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS is_superuser,
             (SELECT rolcreatedb FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_create_db,
             (SELECT rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_create_role,
             (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_bypass_rls,
             pg_catalog.pg_is_in_recovery() AS in_recovery,
             current_setting('transaction_read_only') AS read_only,
             EXISTS (
               SELECT 1 FROM pg_catalog.pg_constraint c
               JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
               WHERE c.conrelid = 'public.bookings'::regclass
                 AND c.conname = 'bookings_customer_time_excl' AND c.contype = 'x'
                 AND c.convalidated AND i.indisvalid AND i.indisready AND i.indislive
             ) AS customer_exclusion,
             EXISTS (
               SELECT 1 FROM pg_catalog.pg_constraint c
               JOIN pg_catalog.pg_index i ON i.indexrelid = c.conindid
               WHERE c.conrelid = 'public.bookings'::regclass
                 AND c.contype = 'x' AND c.convalidated
                 AND c.conname = 'bookings_active_time_excl'
                 AND i.indisvalid AND i.indisready AND i.indislive
             ) AS barber_exclusion,
             to_regclass('public.booking_checkins') IS NOT NULL AS checkins_table,
             to_regclass('public.customer_booking_telegram_outbox') IS NOT NULL AS customer_notices_table,
             to_regclass('public.customer_telegram_links') IS NOT NULL AS telegram_opt_in_table,
             EXISTS (
               SELECT 1 FROM pg_catalog.pg_extension e
               JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
               WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
             ) AS btree_gist_public
    `);
    // Only the source migration registry is read. No user, token, chat, or booking rows.
    const migrationResult = await client.query('SELECT version FROM public.ustara_schema_migrations ORDER BY version');
    const proof = verifyBootstrapSnapshot({
      ...identityResult.rows[0],
      versions: migrationResult.rows.map(row => row.version),
    }, expectedVersions);
    await client.query('ROLLBACK'); started = false; // Explicit no-writes completion.
    return proof;
  } finally {
    if (client) {
      if (started) await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    if (!injectedPool) await pool.end();
  }
}

if (require.main === module) {
  runBootstrapProof()
    .then(proof => console.log(`v194 disposable bootstrap proof PASS: ${proof.migrations} migrations, read-only catalog checks`))
    .catch(() => {
      // No connection details, stack traces, credentials or app data in logs.
      console.error('v194 disposable bootstrap proof BLOCKED/FAILED (inspect isolated CI logs)');
      process.exitCode = 1;
    });
}
module.exports = { expectedMigrationVersions, verifyBootstrapSnapshot, runBootstrapProof };
