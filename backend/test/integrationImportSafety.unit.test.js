const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

test("API integration suite validates both test URLs before loading PostgreSQL or the app pool", () => {
  const source = read("api.integration.test.js");
  assert.doesNotMatch(source.split("test(\"yagona account API")[0], /require\(["'](?:pg|\.\.\/db|\.\.\/server)/);
  assert.ok(source.indexOf("testTarget(ownerDatabaseUrl") < source.indexOf('require("pg")'));
  assert.ok(source.indexOf("testTarget(appDatabaseUrl") < source.indexOf('require("pg")'));
  assert.ok(source.indexOf("assertTestSchema(ownerPool") < source.indexOf('require("../db")'));
  assert.ok(source.indexOf('require("../db")') < source.indexOf('require("../server")'));
});

test("account integrity suites opt in and validate the URL before DB-backed modules", () => {
  const profile = read("account-profile-integrity.integration.test.js");
  const deletion = read("admin-account-deletion.integration.test.js");
  const harness = read("helpers/accountIntegrityHarness.js");
  for (const source of [profile, deletion]) {
    const callbackStart = source.indexOf("async (t) => {");
    const targetCheck = source.indexOf("testTarget(process.env.USTARA_TEST_DATABASE_URL", callbackStart);
    const harnessImport = source.indexOf('require("./helpers/accountIntegrityHarness")', callbackStart);
    assert.ok(callbackStart >= 0);
    assert.ok(targetCheck > callbackStart);
    assert.ok(harnessImport > targetCheck);
    assert.doesNotMatch(source.slice(0, callbackStart), /require\(["'](?:pg|\.\.\/controllers\/|\.\.\/services\/)/);
    assert.equal(source.includes("process.env.USTARA_ACCOUNT_INTEGRITY_TESTS === \"I_AUTHORIZE_TEST_DATABASE\""), true);
  }
  assert.ok(deletion.indexOf('require("../controllers/servicesController")')
    > deletion.indexOf("const harness = await createAccountIntegrityHarness()"));
  assert.ok(deletion.indexOf('require("../services/accountDeletionService")')
    > deletion.indexOf("const harness = await createAccountIntegrityHarness()"));
  assert.ok(harness.indexOf("process.env.USTARA_ACCOUNT_INTEGRITY_TESTS") < harness.indexOf('require("pg")'));
  assert.ok(harness.indexOf("testTarget(databaseUrl") < harness.indexOf('require("pg")'));
  assert.ok(harness.includes("await dropOwnedSchema(owner, target, schema, created, sessionUser, schemaOid)"));
  assert.ok(harness.includes("finally"));
});

test("migration rerun integration suite defers harness and PostgreSQL imports until both opt-ins and URL validation", () => {
  const source = read("account-profile-integrity-rerun.integration.test.js");
  const moduleHeader = source.slice(0, source.indexOf("async function catalogSnapshot"));
  assert.doesNotMatch(moduleHeader, /require\(["'](?:pg|\.\/helpers\/accountIntegrityHarness)/);
  assert.ok(source.includes('process.env.USTARA_ACCOUNT_INTEGRITY_RERUN_TESTS === "I_AUTHORIZE_TEST_DATABASE"'));
  assert.ok(source.indexOf('process.env.USTARA_ACCOUNT_INTEGRITY_TESTS,')
    < source.indexOf("testTarget(process.env.USTARA_TEST_DATABASE_URL"));
  const targetCheck = source.indexOf("testTarget(process.env.USTARA_TEST_DATABASE_URL");
  assert.ok(targetCheck < source.indexOf("await openScenario", targetCheck));
  const harnessFactory = source.slice(source.indexOf("async function openScenario"), source.indexOf("async function expectFailClosedRerun"));
  assert.ok(harnessFactory.indexOf('require("./helpers/accountIntegrityHarness")')
    < harnessFactory.indexOf("await createAccountIntegrityHarness()"));
  assert.ok(source.includes("await client.query(migration)"));
});
