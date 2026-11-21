const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertTestConnection,
  assertTestSchema,
  parseAllowedSessionUsers,
  testTarget,
} = require("./helpers/testDatabaseTarget");
const { allowedAccountTestUsers } = require("./helpers/accountIntegrityHarness");

const url = "postgresql://account_test@localhost/ustara_test_db";
const target = () => testTarget(url, "Account test database", ["account_test"]);

test("test target requires an explicitly allowed session user when configured", () => {
  assert.equal(target().sessionUser, "account_test");
  assert.throws(() => testTarget(url, "Account test database", ["other_test"]), /ruxsat etilgan test user/);
  assert.deepEqual(parseAllowedSessionUsers("first_test, second_test"), ["first_test", "second_test"]);
  assert.deepEqual(allowedAccountTestUsers("account_test, account_test_worker"), ["account_test", "account_test_worker"]);
  assert.throws(() => allowedAccountTestUsers("ustara_test_owner"), /alohida bo'lishi kerak/);
  for (const value of ["", "first_test,first_test", "first_test, BadRole"]) {
    assert.throws(() => parseAllowedSessionUsers(value), /aniq ko'rsatilishi kerak/);
  }
});

test("schema cleanup requires the original schema OID and owner", async () => {
  const { assertOwnedTestSchema } = require("./helpers/testDatabaseTarget");
  const responses = [
    { rows: [{ database: "ustara_test_db", session_user: "account_test", current_user: "account_test", is_superuser: false }] },
    { rows: [{ schema: "account_integrity_1_abcd", resolved_search_path: ["account_integrity_1_abcd", "public"] }] },
    { rows: [{ schema_oid: "41001", owned_by_current_user: true }] },
  ];
  const queryable = { async query() { return responses.shift(); } };
  assert.equal(await assertOwnedTestSchema(queryable, target(), "account_integrity_1_abcd", "account_test", "41001"), "41001");

  const replacedSchema = {
    async query(sql) {
      if (sql.includes("current_database()")) return { rows: [{ database: "ustara_test_db", session_user: "account_test", current_user: "account_test", is_superuser: false }] };
      if (sql.includes("current_schema()")) return { rows: [{ schema: "account_integrity_1_abcd", resolved_search_path: ["account_integrity_1_abcd"] }] };
      return { rows: [{ schema_oid: "41002", owned_by_current_user: true }] };
    },
  };
  await assert.rejects(assertOwnedTestSchema(replacedSchema, target(), "account_integrity_1_abcd", "account_test", "41001"), /yaratgan/);
});

test("pre-schema identity verifies database, session/current user and non-superuser status", async () => {
  let queryCount = 0;
  const queryable = { async query() {
    queryCount += 1;
    return { rows: [{ database: "ustara_test_db", session_user: "account_test",
      current_user: "account_test", is_superuser: false }] };
  } };
  const identity = await assertTestConnection(queryable, target(), "account_test");
  assert.equal(identity.current_user, "account_test");
  assert.equal(queryCount, 1);
  for (const override of [
    { database: "ustara_db" },
    { session_user: "other_test" },
    { current_user: "other_test" },
    { is_superuser: true },
  ]) {
    const invalid = { async query() {
      return { rows: [{ database: "ustara_test_db", session_user: "account_test",
        current_user: "account_test", is_superuser: false, ...override }] };
    } };
    await assert.rejects(assertTestConnection(invalid, target()), /identity noto'g'ri|superuser/);
  }
});

test("post-schema identity requires the generated test schema to lead search_path", async () => {
  const answers = [
    { rows: [{ database: "ustara_test_db", session_user: "account_test",
      current_user: "account_test", is_superuser: false }] },
    { rows: [{ schema: "account_integrity_1_abcd", search_path: "account_integrity_1_abcd, public",
      resolved_search_path: ["account_integrity_1_abcd", "public"] }] },
  ];
  const queryable = { async query() { return answers.shift(); } };
  const schema = await assertTestSchema(queryable, target(), "account_integrity_1_abcd");
  assert.equal(schema.schema, "account_integrity_1_abcd");

  for (const schemaRow of [
    { schema: "public", resolved_search_path: ["public", "account_integrity_1_abcd"] },
    { schema: "account_integrity_1_abcd", resolved_search_path: ["public", "account_integrity_1_abcd"] },
  ]) {
    const invalid = { async query() {
      if (!this.checkedConnection) {
        this.checkedConnection = true;
        return { rows: [{ database: "ustara_test_db", session_user: "account_test",
          current_user: "account_test", is_superuser: false }] };
      }
      return { rows: [schemaRow] };
    } };
    await assert.rejects(assertTestSchema(invalid, target(), "account_integrity_1_abcd"), /search_path/);
  }
  await assert.rejects(assertTestSchema(queryable, target(), "public"), /public/);
});
