// Opt-in runtime regression coverage. Never executed without an isolated test URL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { readBootstrapPlan } = require('../scripts/bootstrap-plan');
const { assertTestIdentity, dropOwnedSchema, testTarget } = require('./helpers/testDatabaseTarget');
const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;
test('fresh bootstrap: actual NOT NULL manifests, stage reruns and drift rejection', { skip: !databaseUrl }, async (t) => {
  const target = testTarget(databaseUrl);
  const schema = `ustara_bootstrap_test_${process.pid}_${Date.now()}`;
  const client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  let schemaCreated = false;
  t.after(async () => {
    try { await dropOwnedSchema(client, target, schema, schemaCreated); }
    finally { await client.end(); }
  });
  await assertTestIdentity(client, target);
  await client.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  await client.query(`SET search_path=${schema},pg_catalog,pg_temp`);
  const pg18 = Number((await client.query('SHOW server_version_num')).rows[0].server_version_num) >= 180000;
  const plan = readBootstrapPlan();
  const comment = async (table) => JSON.parse((await client.query("SELECT obj_description($1::regclass,'pg_class') AS value", [`${schema}.${table}`])).rows[0].value);
  const history = async () => (await client.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows;
  const constraints = async (table) => (await client.query(`SELECT conname AS name,contype AS type,
    pg_get_constraintdef(oid,false) AS definition,convalidated AS validated,
    condeferrable AS deferrable,condeferred AS deferred
    FROM pg_constraint WHERE conrelid=$1::regclass ORDER BY conname`, [`${schema}.${table}`])).rows;
  const nulls = (list, column) => list.filter((c) => c.type === 'n' && c.definition === `NOT NULL ${column}`);
  let original;
  for (const step of plan) {
    if (step.file.endsWith('_02_profile_names.sql')) {
      await t.test('real concurrent table lock times out and rolls back all migration locks/state', async () => {
        const before = { baseline: await comment('registration_phone_limits'), history: await history(),
          customers: await constraints('customers'), barbers: await constraints('barbers') };
        const blocker = new Client({ connectionString: databaseUrl, ssl: false });
        await blocker.connect();
        try {
          await assertTestIdentity(blocker, target);
          await blocker.query(`SET search_path=${schema},pg_catalog,pg_temp`);
          await blocker.query('BEGIN');
          await blocker.query('LOCK TABLE barbers IN ACCESS SHARE MODE');
          await assert.rejects(client.query(step.sql), { code: '55P03' });
          await client.query('ROLLBACK');
          assert.deepEqual({ baseline: await comment('registration_phone_limits'), history: await history(),
            customers: await constraints('customers'), barbers: await constraints('barbers') }, before);
          // customers ACCESS EXCLUSIVE was acquired before barbers timed out;
          // NOWAIT on another connection proves rollback released that lock.
          await blocker.query('LOCK TABLE customers IN ACCESS EXCLUSIVE MODE NOWAIT');
        } finally {
          await blocker.query('ROLLBACK');
          await blocker.end();
        }
      });
      await t.test('second DROP failure rolls back first DROP, NOT NULL, baseline and marker', async () => {
        const before = { baseline: await comment('registration_phone_limits'), history: await history(),
          customers: await constraints('customers'), barbers: await constraints('barbers') };
        // customers is dropped first; this dependency forces failure at barbers.
        await client.query('CREATE VIEW legacy_barber_dependency AS SELECT name FROM barbers');
        await assert.rejects(client.query(step.sql), { code: '2BP01' });
        await client.query('ROLLBACK');
        assert.deepEqual({ baseline: await comment('registration_phone_limits'), history: await history(),
          customers: await constraints('customers'), barbers: await constraints('barbers') }, before);
        const columns = await client.query(`SELECT table_name FROM information_schema.columns
          WHERE table_schema=$1 AND table_name IN ('customers','barbers') AND column_name='name'`, [schema]);
        assert.equal(columns.rowCount, 2);
        await client.query('DROP VIEW legacy_barber_dependency');
      });
    }
    await client.query(step.sql);
    if (step.file === 'bootstrap/core.sql' && pg18) {
      // Names are arbitrary: matching must use type+column definition, not a
      // generated *_not_null name. Capture these names in the later OTP archive.
      await client.query('ALTER TABLE customers RENAME CONSTRAINT customers_name_not_null TO custom_legacy_customer_nn');
      await client.query('ALTER TABLE barbers RENAME CONSTRAINT barbers_name_not_null TO custom_legacy_barber_nn');
    }
    if (step.file.endsWith('/20261114_otp_registration.sql')) original = await comment('registration_phone_limits');
    if (step.file.endsWith('_02_profile_names.sql')) {
      await t.test('profile drop removes only legacy name NOT NULL and preserves exact archive', async () => {
        const baseline = await comment('registration_phone_limits');
        assert.deepEqual(baseline.profile_names_previous_baseline, original);
        for (const table of ['customers', 'barbers']) {
          const old = original.tables[table].constraints;
          assert.equal(nulls(old, 'name').length, pg18 ? 1 : 0);
          assert.deepEqual(baseline.tables[table].constraints, old.filter((c) => !nulls([c], 'name').length));
          assert.deepEqual(await constraints(table), baseline.tables[table].constraints);
        }
      });
    }
    if (step.file.endsWith('_03_barber_specialty.sql')) {
      await t.test('specialty separates CHECK from NOT NULL and retains other constraints', async () => {
        const baseline = await comment('registration_phone_limits');
        for (const table of ['barbers', 'pending_registrations']) {
          const live = await constraints(table);
          assert.deepEqual(live, baseline.tables[table].constraints);
          const added = baseline.barber_specialty_additions[table];
          assert.equal(added.constraint.type, 'c');
          const nn = nulls(live, 'specialty');
          assert.equal(nn.length, pg18 && table === 'barbers' ? 1 : 0);
          assert.deepEqual(added.not_null_constraints || [], nn);
          const reduced = live.filter((c) => c.name !== `${table}_specialty_check` && !nn.some((n) => n.name === c.name));
          assert.deepEqual(reduced, baseline.barber_specialty_previous_baseline.tables[table].constraints);
        }
      });
    }
    if (step.file.endsWith('_01_booking_duration.sql')) {
      await t.test('booking snapshot manifest includes NOT NULL separately from positive CHECK', async () => {
        const baseline = await comment('bookings');
        const live = await constraints('bookings');
        assert.deepEqual(baseline.signature.constraints, live);
        assert.equal(nulls(live, 'duration_minutes').length, pg18 ? 1 : 0);
        assert.equal(live.find((c) => c.name === 'bookings_duration_minutes_check').type, 'c');
        assert.equal(nulls(baseline.previous_signature.constraints, 'duration_minutes').length, 0);
      });
    }
    // Rerun at its own stage, before later migrations intentionally advance archives.
    if (/_02_profile_names.sql$|_03_barber_specialty.sql$|_01_booking_duration.sql$/.test(step.file)) {
      const table = step.file.includes('booking_duration') ? 'bookings' : 'registration_phone_limits';
      const before = { baseline: await comment(table), history: await history() };
      await client.query(step.sql);
      assert.deepEqual({ baseline: await comment(table), history: await history() }, before);
    }
  }
  await t.test('later owner manifests and final integrity migration validate after the complete chain', async () => {
    for (const file of ['20261114_otp_registration.sql', '20261114_security_01_login_protection.sql', '20261114_security_02_password_reset.sql',
      '20261114_telegram_01_barber_links.sql',
      '20261115_slots_02_booking_no_overlap.sql',
      '20261116_account_profile_deletion_integrity.sql',
      '20261117_barber_profile.sql']) {
      await client.query(plan.find((s) => s.file === `migrations/${file}`).sql);
    }
  });
  await t.test('unrelated duration-table drift refuses rerun without changing baseline/history', async () => {
    const before = { baseline: await comment('bookings'), history: await history() };
    await client.query('DROP INDEX idx_bookings_barber_time');
    await assert.rejects(client.query(plan.find((s) => s.file.endsWith('_01_booking_duration.sql')).sql), /drift/);
    await client.query('ROLLBACK');
    assert.deepEqual({ baseline: await comment('bookings'), history: await history() }, before);
    assert.equal((await client.query("SELECT to_regclass('idx_bookings_barber_time') IS NULL AS missing")).rows[0].missing, true);
  });
});
