// Explicitly opt-in: regress the non-C locale that exposed the inventory bug.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { readBootstrapPlan } = require('../scripts/bootstrap-plan');
const { assertTestIdentity, dropOwnedSchema, testTarget } = require('./helpers/testDatabaseTarget');
const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;

test('verify inventory under en_US.UTF-8 checks exact names in deterministic order', { skip: !databaseUrl }, async (t) => {
  const target = testTarget(databaseUrl);
  const client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  const schema = `ustara_bootstrap_test_verify_${process.pid}_${Date.now()}`;
  let schemaCreated = false;
  t.after(async () => {
    try { await dropOwnedSchema(client, target, schema, schemaCreated); }
    finally { await client.end(); }
  });
  await assertTestIdentity(client, target);
  const locale = (await client.query('SELECT datcollate FROM pg_database WHERE datname=current_database()')).rows[0].datcollate;
  assert.match(locale, /^en_US\.utf-?8$/i, 'run this regression in an en_US.UTF-8 disposable database');
  assert.equal((await client.query("SELECT current_setting('server_version_num')::int / 10000 AS major")).rows[0].major, 18);
  await client.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  await client.query(`SET search_path=${schema},pg_catalog,pg_temp`);
  const plan = readBootstrapPlan();
  for (const step of plan) await client.query(step.sql);
  const verify = plan.find((s) => s.file === 'bootstrap/verify.sql').sql;
  const names = async () => (await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname`, [schema])).rows.map((r) => r.relname);
  const history = async () => (await client.query('SELECT * FROM ustara_schema_migrations ORDER BY version')).rows;
  const before = { names: await names(), history: await history() };

  await t.test('accepts all 21 correct tables despite differing name/text default sort orders', async () => {
    assert.equal(before.names.length, 21);
    // Prove this database actually reproduces the original failure condition.
    const orders = (await client.query(`SELECT
      (SELECT array_agg(c.relname::text ORDER BY c.relname)
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=$1 AND c.relkind='r') AS name_order,
      (SELECT array_agg(name ORDER BY name) FROM unnest($2::text[]) t(name)) AS text_order`,
      [schema, before.names])).rows[0];
    assert.notDeepEqual(orders.name_order, orders.text_order);
    await client.query("SELECT pg_advisory_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || current_schema()))");
    await client.query(verify);
    assert.deepEqual({ names: await names(), history: await history() }, before);
  });

  await t.test('rejects a wrong table name even when the table count remains 21', async () => {
    await client.query('BEGIN');
    try {
      await client.query('ALTER TABLE services RENAME TO services_wrong_inventory_name');
      assert.equal((await names()).length, 21);
      await assert.rejects(client.query(verify), { code: 'P0001', message: 'Fresh bootstrap: final table inventory mismatch' });
    } finally { await client.query('ROLLBACK'); }
    assert.deepEqual({ names: await names(), history: await history() }, before);
  });
});
