#!/usr/bin/env node
'use strict';

// Read-only privilege audit for local-booking.integration.test.js.
// Reads no application rows and performs no writes or schema changes.
const { Pool } = require('pg');
const { validateLocalTestUrl } = require('../database/poolConfig');

const DATABASE = 'ustara_test_db';
const ROLE = 'ustara_test_owner';
const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;

const requirements = [
  ['users', ['SELECT', 'INSERT', 'DELETE']],
  ['customers', ['SELECT', 'INSERT', 'DELETE']],
  ['barbers', ['SELECT', 'INSERT', 'DELETE', 'UPDATE_LOCK']],
  ['services', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['barber_working_hours', ['SELECT', 'INSERT', 'DELETE']],
  ['bookings', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']],
  ['admin_accounts', ['SELECT']],
  ['ustara_schema_migrations', ['SELECT']],
  ['registration_phone_limits', ['SELECT']],
  ['pending_registrations', ['SELECT']],
  ['registration_otp_history', ['SELECT']],
  ['registration_security_events', ['SELECT']],
  ['registration_admin_actions', ['SELECT']],
  ['login_attempt_limits', ['SELECT']],
  ['account_session_versions', ['SELECT', 'DELETE']],
  ['password_reset_limits', ['SELECT']],
  ['password_reset_requests', ['SELECT']],
  ['password_reset_events', ['SELECT']],
  ['barber_telegram_links', ['SELECT', 'INSERT', 'DELETE']],
  ['barber_telegram_link_tokens', ['SELECT']],
  ['telegram_bot_state', ['SELECT']],
];

function safeErrorMessage(error) {
  return String(error?.message || 'Diagnostic failed')
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '<database URL redacted>')
    .replace(/\b(?:password|passwd|pwd)=[^\s&]+/gi, 'password=<redacted>')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
}

function printTableRows(rows) {
  for (const row of rows) {
    const privileges = `SELECT=${row.can_select ? 'yes' : 'no'} `
      + `INSERT=${row.can_insert ? 'yes' : 'no'} `
      + `UPDATE=${row.can_update ? 'yes' : 'no'} `
      + `DELETE=${row.can_delete ? 'yes' : 'no'}`;
    console.log([
      row.table_name,
      `exists=${row.table_exists ? 'yes' : 'no'}`,
      `owner=${row.table_owner || '<missing>'}`,
      privileges,
      `UPDATE(any-column)=${row.can_update_any_column ? 'yes' : 'no'}`,
      `required=${row.required_privileges.map((p) => p === 'UPDATE_LOCK' ? 'UPDATE(any column; FOR SHARE)' : p).join(',')}`,
      `missing=${row.missing_required_privileges.map((p) => p === 'UPDATE_LOCK' ? 'UPDATE(any column; FOR SHARE)' : p).join(',') || 'none'}`,
    ].join(' | '));
  }
}

async function main() {
  if (!databaseUrl) throw new Error('USTARA_TEST_DATABASE_URL mavjud emas');

  // Validate the database and network target before creating a Pool/connection.
  const target = validateLocalTestUrl(databaseUrl, 'Local booking test database');
  if (target.database !== DATABASE) throw new Error(`Faqat ${DATABASE} ruxsat etilgan`);
  if (target.sessionUser !== ROLE) throw new Error(`Ulanish URL session role’i ${ROLE} bo‘lishi kerak`);
  if (!(target.host.startsWith('/') || ['localhost', '127.0.0.1', '::1'].includes(target.host))) {
    throw new Error('Faqat localhost yoki Unix socket ruxsat etilgan');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: 5000,
    application_name: 'ustara_local_booking_privilege_audit',
  });
  let client;
  try {
    client = await pool.connect();
    const identityResult = await client.query(
      'SELECT current_database() AS database, session_user, current_user, current_schema() AS schema'
    );
    const identity = identityResult.rows[0];
    console.log(`Identity: database=${identity.database} session_user=${identity.session_user} current_user=${identity.current_user} current_schema=${identity.schema}`);
    if (identity.database !== DATABASE) throw new Error(`Runtime database must be ${DATABASE}`);
    if (identity.session_user !== ROLE) throw new Error(`Runtime session_user must be ${ROLE}`);

    const schemaResult = await client.query(`
      SELECT
        current_database() AS database,
        has_database_privilege($1::name, current_database(), 'CONNECT') AS can_connect,
        has_schema_privilege($1::name, 'public', 'USAGE') AS can_use_public_schema
    `, [ROLE]);
    const schemaRights = schemaResult.rows[0];
    console.log(`Scope: database=${schemaRights.database} CONNECT=${schemaRights.can_connect ? 'yes' : 'no'} public.USAGE=${schemaRights.can_use_public_schema ? 'yes' : 'no'}`);

    const values = requirements.map((_, index) => `($${index * 2 + 1}::text, $${index * 2 + 2}::text[])`).join(',\n');
    const parameters = requirements.flatMap(([table, privileges]) => [table, privileges]);
    const tablesResult = await client.query(`
      WITH required(table_name, required_privileges) AS (
        VALUES ${values}
      ), target_role AS (
        SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $${parameters.length + 1}
      )
      SELECT
        required.table_name,
        (relation.oid IS NOT NULL) AS table_exists,
        CASE WHEN relation.oid IS NULL THEN NULL
             ELSE pg_catalog.pg_get_userbyid(relation.relowner) END AS table_owner,
        required.required_privileges,
        (target_role.oid IS NOT NULL AND relation.oid IS NOT NULL
          AND pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'SELECT')) AS can_select,
        (target_role.oid IS NOT NULL AND relation.oid IS NOT NULL
          AND pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'INSERT')) AS can_insert,
        (target_role.oid IS NOT NULL AND relation.oid IS NOT NULL
          AND pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'UPDATE')) AS can_update,
        (target_role.oid IS NOT NULL AND relation.oid IS NOT NULL
          AND pg_catalog.has_any_column_privilege(target_role.oid, relation.oid, 'UPDATE')) AS can_update_any_column,
        (target_role.oid IS NOT NULL AND relation.oid IS NOT NULL
          AND pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'DELETE')) AS can_delete,
        CASE WHEN target_role.oid IS NULL OR relation.oid IS NULL THEN required.required_privileges
             ELSE ARRAY(
               SELECT privilege
               FROM unnest(required.required_privileges) AS privilege
               WHERE NOT CASE WHEN privilege = 'UPDATE_LOCK'
                 THEN pg_catalog.has_any_column_privilege(target_role.oid, relation.oid, 'UPDATE')
                 ELSE pg_catalog.has_table_privilege(target_role.oid, relation.oid, privilege)
               END
               ORDER BY privilege
             ) END AS missing_required_privileges,
        (target_role.oid IS NOT NULL) AS target_role_exists
      FROM required
      LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.nspname = 'public'
      LEFT JOIN pg_catalog.pg_class relation
        ON relation.relnamespace = namespace.oid
       AND relation.relname = required.table_name
       AND relation.relkind IN ('r', 'p')
      LEFT JOIN target_role ON true
      ORDER BY required.table_name
    `, [...parameters, ROLE]);

    if (tablesResult.rows.some((row) => !row.target_role_exists)) {
      throw new Error(`Role ${ROLE} topilmadi`);
    }
    console.log('Table privileges (faqat katalog va privilege metadata; jadval qatorlari o‘qilmadi):');
    printTableRows(tablesResult.rows);

    const sequenceResult = await client.query(`
      SELECT
        table_relation.relname AS table_name,
        attribute.attname AS column_name,
        sequence_namespace.nspname AS sequence_schema,
        sequence_relation.relname AS sequence_name,
        pg_catalog.pg_get_userbyid(sequence_relation.relowner) AS sequence_owner,
        CASE attribute.attidentity WHEN 'a' THEN 'identity-always'
                                   WHEN 'd' THEN 'identity-by-default'
                                   ELSE 'serial-or-sequence-default' END AS generation_kind,
        pg_catalog.has_sequence_privilege($1::name, sequence_relation.oid, 'USAGE') AS can_usage,
        pg_catalog.has_sequence_privilege($1::name, sequence_relation.oid, 'SELECT') AS can_select,
        pg_catalog.has_sequence_privilege($1::name, sequence_relation.oid, 'UPDATE') AS can_update,
        CASE WHEN attribute.attidentity = ''
             THEN (pg_catalog.has_sequence_privilege($1::name, sequence_relation.oid, 'USAGE')
                OR pg_catalog.has_sequence_privilege($1::name, sequence_relation.oid, 'UPDATE'))
             ELSE true END AS insert_sequence_privilege_satisfied
      FROM pg_catalog.pg_class table_relation
      JOIN pg_catalog.pg_namespace table_namespace ON table_namespace.oid = table_relation.relnamespace
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = table_relation.oid
       AND attribute.attnum > 0
       AND NOT attribute.attisdropped
      JOIN pg_catalog.pg_depend dependency
        ON dependency.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
       AND dependency.refobjid = table_relation.oid
       AND dependency.refobjsubid = attribute.attnum
       AND dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
       AND dependency.deptype IN ('a', 'i')
      JOIN pg_catalog.pg_class sequence_relation
        ON sequence_relation.oid = dependency.objid
       AND sequence_relation.relkind = 'S'
      JOIN pg_catalog.pg_namespace sequence_namespace ON sequence_namespace.oid = sequence_relation.relnamespace
      WHERE table_namespace.nspname = 'public'
        AND table_relation.relname = ANY($2::text[])
      ORDER BY table_relation.relname, attribute.attnum
    `, [ROLE, requirements.filter(([, privileges]) => privileges.includes('INSERT')).map(([table]) => table)]);
    console.log('Fixture sequence privileges:');
    if (!sequenceResult.rows.length) console.log('No owned serial/identity sequences found for fixture insert tables.');
    for (const row of sequenceResult.rows) {
      console.log(`${row.table_name}.${row.column_name} -> ${row.sequence_schema}.${row.sequence_name} `
        + `owner=${row.sequence_owner} kind=${row.generation_kind} `
        + `USAGE=${row.can_usage ? 'yes' : 'no'} SELECT=${row.can_select ? 'yes' : 'no'} `
        + `UPDATE=${row.can_update ? 'yes' : 'no'} `
        + `insert_sequence_privilege_satisfied=${row.insert_sequence_privilege_satisfied ? 'yes' : 'no'}`);
    }

    const missing = tablesResult.rows.flatMap((row) => [
      ...(!row.table_exists ? [`missing table public.${row.table_name}`] : []),
      ...row.missing_required_privileges.map((privilege) => `public.${row.table_name}: missing ${privilege}`),
    ]);
    if (!schemaRights.can_connect) missing.push(`database ${DATABASE}: missing CONNECT`);
    if (!schemaRights.can_use_public_schema) missing.push('schema public: missing USAGE');
    for (const row of sequenceResult.rows) {
      if (!row.insert_sequence_privilege_satisfied) {
        missing.push(`${row.sequence_schema}.${row.sequence_name}: serial insert requires USAGE or UPDATE`);
      }
    }
    console.log(missing.length ? `Missing required privileges: ${missing.join('; ')}` : 'Missing required privileges: none detected');
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const code = error?.code ? ` [${error.code}]` : '';
  console.error(`Local booking privilege diagnostic failed${code}: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
