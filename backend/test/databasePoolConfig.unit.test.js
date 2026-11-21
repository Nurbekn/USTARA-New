const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPoolConfig } = require("../database/poolConfig");
const { createWorkerPoolConfig } = require("../telegram/worker");

const testUrl = "postgresql://test_owner@localhost/ustara_test_db";
const productionEnv = {
  NODE_ENV: "production",
  DB_HOST: "db.example.invalid",
  DB_PORT: "5432",
  DB_NAME: "ustara_prod",
  DB_USER: "ustara_app",
  DB_PASSWORD: "placeholder-only",
};

test("production refuses every USTARA_TEST_* override", () => {
  assert.throws(() => createPoolConfig({ ...productionEnv, USTARA_TEST_DATABASE_URL: testUrl }), /USTARA_TEST_\*/);
  assert.throws(() => createPoolConfig({ ...productionEnv, USTARA_TEST_USE_APP_DATABASE_URL: "1" }), /USTARA_TEST_\*/);
});

test("test mode accepts only local ustara_test_db and disables TLS for that target", () => {
  const config = createPoolConfig({ NODE_ENV: "test", USTARA_TEST_DATABASE_URL: testUrl });
  assert.equal(config.connectionString, testUrl);
  assert.equal(config.ssl, false);
});

test("test app URL selection keeps the existing fallback and validates both targets", () => {
  const selected = createPoolConfig({ NODE_ENV: "test", USTARA_TEST_USE_APP_DATABASE_URL: "1",
    USTARA_TEST_APP_DATABASE_URL: "postgresql://test_app@localhost/ustara_test_db" });
  assert.match(selected.connectionString, /test_app@localhost/);
  const fallback = createPoolConfig({ NODE_ENV: "test", USTARA_TEST_USE_APP_DATABASE_URL: "1",
    USTARA_TEST_DATABASE_URL: testUrl });
  assert.equal(fallback.connectionString, testUrl);
});

test("test mode rejects ustara_db and remote hosts", () => {
  assert.throws(() => createPoolConfig({ NODE_ENV: "test",
    USTARA_TEST_DATABASE_URL: "postgresql://test_owner@localhost/ustara_db" }), /ustara_test_db/);
  assert.throws(() => createPoolConfig({ NODE_ENV: "test",
    USTARA_TEST_DATABASE_URL: "postgresql://test_owner@remote.example/ustara_test_db" }), /local host/);
});

test("test search path accepts a single safe schema identifier only", () => {
  assert.equal(createPoolConfig({ NODE_ENV: "test", USTARA_TEST_DATABASE_URL: testUrl,
    USTARA_TEST_SEARCH_PATH: "test_123_456" }).options, "-c search_path=test_123_456");
  for (const schema of ["public,pg_catalog", "x -c role=admin", "Upper", "", `${"a".repeat(64)}`]) {
    assert.throws(() => createPoolConfig({ NODE_ENV: "test", USTARA_TEST_DATABASE_URL: testUrl,
      USTARA_TEST_SEARCH_PATH: schema }), /schema nomi noto'g'ri/);
  }
});

test("production SSL validates certificates", () => {
  const config = createPoolConfig(productionEnv);
  assert.equal(config.ssl.rejectUnauthorized, true);
});

test("Telegram worker uses the shared PostgreSQL SSL and target policy", () => {
  const env = { ...productionEnv, DB_SSL_CA: "placeholder-ca" };
  assert.deepEqual(createWorkerPoolConfig(env), createPoolConfig(env));
});
