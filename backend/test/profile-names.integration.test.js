const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool, Client } = require("pg");
const { assertTestIdentity, dropOwnedSchema, testTarget } = require("./helpers/testDatabaseTarget");

// Authored for a future, explicitly isolated PostgreSQL run. Not executed as
// part of the split-name implementation; never use a real application database.
const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;
test("split profile names: safe drop, baseline archive, reruns and drift", { skip: !databaseUrl }, async (t) => {
  const target = testTarget(databaseUrl);
  const owner = new Pool({ connectionString: databaseUrl, ssl: false });
  const schema = `profile_names_${process.pid}_${Date.now()}`;
  let schemaCreated = false;
  let client;
  t.after(async () => {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve cleanup ordering after an aborted migration. */ }
      await client.end();
    }
    try { await dropOwnedSchema(owner, target, schema, schemaCreated); }
    finally { await owner.end(); }
  });
  await assertTestIdentity(owner, target);
  await owner.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  client = new Client({ connectionString: databaseUrl, ssl: false, options: `-c search_path=${schema}` });
  await client.connect();
  await assertTestIdentity(client, target);
  const migration = (file) => fs.readFileSync(path.join(__dirname, "../database/migrations", file), "utf8");
  const otp = migration("20261114_otp_registration.sql");
  const split = migration("20261114_otp_registration_02_profile_names.sql");
  await client.query(fs.readFileSync(path.join(__dirname, "fixtures/pre_otp_schema.sql"), "utf8"));
  for (const filename of ["20261113_00_users_foundation.sql", "20261113_unified_accounts.sql", "20261113_unified_accounts_02_admin_accounts.sql"]) {
    await client.query(migration(filename));
  }
  await client.query(otp);
  // Explicit predecessor-schema seeds: these legacy columns are intentional
  // historical migration fixtures, never current application dependencies.
  await client.query("INSERT INTO users(phone,password,role) VALUES('+998901111111','fixture','customer'),('+998902222222','fixture','barber')");
  await client.query("INSERT INTO customers(user_id,name) SELECT id,'Legacy customer' FROM users WHERE role='customer'");
  await client.query("INSERT INTO barbers(user_id,name,first_name,last_name) SELECT id,'Legacy barber',$1,$2 FROM users WHERE role='barber'", ["A".repeat(80), "B".repeat(80)]);
  async function snapshot() {
    return {
      baseline: (await client.query("SELECT obj_description('registration_phone_limits'::regclass,'pg_class') AS value")).rows[0].value,
      tracking: (await client.query("SELECT * FROM ustara_schema_migrations ORDER BY version")).rows,
    };
  }
  const before = await snapshot();
  await t.test("missing split names refuse destructive guessing and preserve baseline/tracking", async () => {
    await assert.rejects(client.query(split), /needs reviewed first_name\/last_name backfill/);
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), before);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('customers','barbers') AND column_name='name'", [schema])).rows[0].n, 2);
    await client.query("UPDATE customers SET first_name='Ali',last_name='Valiyev'");
  });
  await t.test("external view dependency prevents drop without CASCADE or partial changes", async () => {
    await client.query("CREATE VIEW legacy_profile_view AS SELECT name FROM customers");
    await assert.rejects(client.query(split), { code: "2BP01" });
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), before);
    await client.query("DROP VIEW legacy_profile_view");
  });
  await t.test("drop both old columns, preserve individual VARCHAR(80), data and prior baseline", async () => {
    const profilesBefore = (await client.query("SELECT 'customer' AS role,id,user_id,first_name,last_name FROM customers UNION ALL SELECT 'barber',id,user_id,first_name,last_name FROM barbers ORDER BY role")).rows;
    await client.query(split);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('customers','barbers') AND column_name='name'", [schema])).rows[0].n, 0);
    const columns = (await client.query("SELECT character_maximum_length FROM information_schema.columns WHERE table_schema=$1 AND table_name IN ('customers','barbers') AND column_name IN ('first_name','last_name')", [schema])).rows;
    assert.deepEqual(columns.map((row) => row.character_maximum_length), [80, 80, 80, 80]);
    assert.deepEqual((await client.query("SELECT 'customer' AS role,id,user_id,first_name,last_name FROM customers UNION ALL SELECT 'barber',id,user_id,first_name,last_name FROM barbers ORDER BY role")).rows, profilesBefore);
    const after = await snapshot();
    assert.deepEqual(JSON.parse(after.baseline).profile_names_previous_baseline, JSON.parse(before.baseline));
    assert.deepEqual(after.tracking.filter((row) => row.version !== '20261114_otp_registration_02_profile_names'), before.tracking);
  });
  await t.test("old OTP rerun and new migration rerun preserve current baseline and tracking", async () => {
    const after = await snapshot();
    await client.query(otp);
    await client.query(split);
    assert.deepEqual(await snapshot(), after);
    // The old combined cap is absent: 80 + 80 remains valid; 81 is rejected.
    await client.query("BEGIN");
    await client.query("UPDATE customers SET first_name=$1,last_name=$2", ["A".repeat(80), "B".repeat(80)]);
    await assert.rejects(client.query("UPDATE customers SET first_name=$1", ["A".repeat(81)]), { code: "22001" });
    await client.query("ROLLBACK");
  });
  await t.test("unrelated index drift is not adopted or repaired", async () => {
    await client.query("DROP INDEX pending_registrations_completion_expiry_idx");
    const after = await snapshot();
    await assert.rejects(client.query(split), /schema drift/);
    await client.query("ROLLBACK");
    assert.deepEqual(await snapshot(), after);
    assert.equal((await client.query("SELECT to_regclass('pending_registrations_completion_expiry_idx') IS NULL AS missing")).rows[0].missing, true);
  });
});
