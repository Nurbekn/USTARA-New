const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client, Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const { assertTestIdentity, dropOwnedSchema, testTarget } = require("./helpers/testDatabaseTarget");

const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;

test("admin_accounts migration va rollback PostgreSQL sinovlari", { skip: !databaseUrl }, async (t) => {
  const target = testTarget(databaseUrl);

  const owner = new Pool({ connectionString: databaseUrl, ssl: false });
  const schema = `admin_accounts_test_${process.pid}_${Date.now()}`;
  let schemaCreated = false;
  let client;
  t.after(async () => {
    try { if (client) await client.query("ROLLBACK"); } catch { /* The test connection may be aborted. */ }
    if (client) await client.end();
    try { await dropOwnedSchema(owner, target, schema, schemaCreated); }
    finally { await owner.end(); }
  });
  await assertTestIdentity(owner, target);
  await owner.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  client = new Client({ connectionString: databaseUrl, ssl: false, options: `-c search_path=${schema}` });
  await client.connect();
  await assertTestIdentity(client, target);
  const migration = fs.readFileSync(path.join(__dirname, "../database/migrations/20261113_unified_accounts_02_admin_accounts.sql"), "utf8");
  const rollback = fs.readFileSync(path.join(__dirname, "../database/migrations/20261113_unified_accounts_02_admin_accounts_rollback.sql"), "utf8");

  async function assertSeed(active) {
    const result = await client.query("SELECT id,is_active FROM admin_accounts");
    assert.deepEqual(result.rows, [{ id: 1, is_active: active }]);
    const columns = await client.query(`
      SELECT column_name,data_type,is_nullable,column_default
      FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='admin_accounts'
      ORDER BY ordinal_position`, [schema]);
    assert.deepEqual(columns.rows.map(({ column_name, data_type, is_nullable }) => ({ column_name, data_type, is_nullable })), [
      { column_name: "id", data_type: "integer", is_nullable: "NO" },
      { column_name: "is_active", data_type: "boolean", is_nullable: "NO" },
      { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
    ]);
    const constraints = await client.query("SELECT contype FROM pg_constraint WHERE conrelid='admin_accounts'::regclass ORDER BY contype");
    assert.deepEqual(constraints.rows.map((row) => row.contype), ["c", "p"]);
  }

  await t.test("yangi jadval va id=1 boshlang‘ich yozuv", async () => {
    await client.query(migration);
    await assertSeed(true);
  });

  await t.test("qayta migration faollik qiymatini o‘zgartirmaydi", async () => {
    await client.query(migration);
    await assertSeed(true);
    await client.query("UPDATE admin_accounts SET is_active=FALSE WHERE id=1");
    await client.query(migration);
    await assertSeed(false);
  });

  await t.test("noto‘g‘ri jadvalda migration to‘xtaydi va holatni saqlaydi", async () => {
    await client.query("DROP TABLE admin_accounts");
    await client.query("CREATE TABLE admin_accounts (id INTEGER PRIMARY KEY, is_active TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    await assert.rejects(client.query(migration));
    await client.query("ROLLBACK");
    const result = await client.query("SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='admin_accounts' AND column_name='is_active'", [schema]);
    assert.equal(result.rows[0].data_type, "text");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM admin_accounts")).rows[0].count, 0);
  });

  await t.test("faol admin bilan rollback jadvalni olib tashlaydi", async () => {
    await client.query("DROP TABLE admin_accounts");
    await client.query(migration);
    await client.query("UPDATE admin_accounts SET is_active=TRUE WHERE id=1");
    await client.query(rollback);
    assert.equal((await client.query("SELECT to_regclass($1) AS name", [`${schema}.admin_accounts`])).rows[0].name, null);
  });

  await t.test("nofaol admin rollbackda saqlanadi", async () => {
    await client.query(migration);
    await client.query("UPDATE admin_accounts SET is_active=FALSE WHERE id=1");
    await assert.rejects(client.query(rollback));
    await client.query("ROLLBACK");
    await assertSeed(false);
  });

  await t.test("qo‘shimcha yozuv singleton CHECK bilan bloklanadi", async () => {
    await assert.rejects(client.query("INSERT INTO admin_accounts(id,is_active) VALUES(2,TRUE)"));
    await client.query("ROLLBACK");
    await assertSeed(false);
  });

  await t.test("qo‘shimcha constraint bilan rollback xavfsiz to‘xtaydi", async () => {
    await client.query("ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_unexpected_check CHECK (is_active IN (TRUE,FALSE))");
    await assert.rejects(client.query(rollback));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='admin_accounts'::regclass")).rows[0].count, 3);
    assert.equal((await client.query("SELECT is_active FROM admin_accounts WHERE id=1")).rows[0].is_active, false);
    await client.query("ALTER TABLE admin_accounts DROP CONSTRAINT admin_accounts_unexpected_check");
  });

  await t.test("tashqi FK bog‘liqligi rollbackda o‘chmaydi", async () => {
    await client.query("CREATE TABLE admin_audit (admin_id INTEGER REFERENCES admin_accounts(id))");
    await client.query("INSERT INTO admin_audit(admin_id) VALUES(1)");
    await client.query("UPDATE admin_accounts SET is_active=TRUE WHERE id=1");
    await assert.rejects(client.query(rollback));
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::int AS count FROM admin_audit")).rows[0].count, 1);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM admin_accounts")).rows[0].count, 1);
    await client.query("DROP TABLE admin_audit");
    await client.query(rollback);
    assert.equal((await client.query("SELECT to_regclass($1) AS name", [`${schema}.admin_accounts`])).rows[0].name, null);
  });
});
