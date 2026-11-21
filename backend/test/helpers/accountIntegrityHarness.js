const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const {
  assertTestConnection,
  assertTestSchema,
  dropOwnedSchema,
  parseAllowedSessionUsers,
  testTarget,
} = require("./testDatabaseTarget");

function allowedAccountTestUsers(value) {
  const users = parseAllowedSessionUsers(value, "USTARA_ACCOUNT_INTEGRITY_TEST_USERS");
  if (users.some((user) => ["ustara_test_owner", "ustara_test_app"].includes(user))) {
    throw new Error("Account Integrity role'lari API suite owner/app role'laridan alohida bo'lishi kerak");
  }
  return users;
}

function cleanupFailure(primary, cleanupErrors, message) {
  if (!cleanupErrors.length) return primary;
  return new AggregateError([primary, ...cleanupErrors], message, { cause: primary });
}

async function createAccountIntegrityHarness() {
  if (process.env.USTARA_ACCOUNT_INTEGRITY_TESTS !== "I_AUTHORIZE_TEST_DATABASE") {
    throw new Error("Explicit account integrity integration-test opt-in required");
  }
  if (process.env.NODE_ENV !== "test") throw new Error("Account integrity integration tests require NODE_ENV=test");

  const databaseUrl = process.env.USTARA_TEST_DATABASE_URL;
  const allowedUsers = allowedAccountTestUsers(process.env.USTARA_ACCOUNT_INTEGRITY_TEST_USERS);
  const target = testTarget(databaseUrl, "Account integrity test database", allowedUsers);
  const schema = `account_integrity_${process.pid}_${randomBytes(5).toString("hex")}`;
  const sessionUser = target.sessionUser;
  const { Pool } = require("pg");
  const owner = new Pool({ connectionString: databaseUrl, ssl: false, max: 1,
    options: `-c search_path=${schema}` });
  let created = false;
  let schemaOid;
  let pool;

  try {
    await assertTestConnection(owner, target, sessionUser);
    await owner.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    schemaOid = (await owner.query("SELECT oid::text AS oid FROM pg_catalog.pg_namespace WHERE nspname = $1", [schema])).rows[0]?.oid;
    if (!schemaOid) throw new Error("Yaratilgan account-test schema katalogdan topilmadi");
    await assertTestSchema(owner, target, schema, sessionUser);

    pool = new Pool({ connectionString: databaseUrl, ssl: false, max: 6,
      options: `-c search_path=${schema}` });
    await assertTestSchema(pool, target, schema, sessionUser);

    const fixture = fs.readFileSync(path.join(__dirname, "../fixtures/pre_otp_schema.sql"), "utf8");
    await pool.query(fixture);
    const migrationDir = path.join(__dirname, "../../database/migrations");
    const migrations = fs.readdirSync(migrationDir)
      .filter((file) => file.endsWith(".sql") && !file.endsWith("_rollback.sql"))
      .sort();
    for (const file of migrations) {
      await assertTestSchema(pool, target, schema, sessionUser);
      await pool.query(fs.readFileSync(path.join(migrationDir, file), "utf8"));
    }

    let closed = false;
    return {
      pool,
      schema,
      target,
      sessionUser,
      async close() {
        if (closed) return;
        closed = true;
        const cleanupErrors = [];
        try {
          await pool.end();
        } catch (error) {
          cleanupErrors.push(error);
        } finally {
          try {
            await dropOwnedSchema(owner, target, schema, created, sessionUser, schemaOid);
          } catch (error) {
            cleanupErrors.push(error);
          } finally {
            try {
              await owner.end();
            } catch (error) {
              cleanupErrors.push(error);
            }
          }
        }
        if (cleanupErrors.length) {
          throw new AggregateError(cleanupErrors, "Account Integrity test harness cleanup failed");
        }
      },
    };
  } catch (error) {
    const cleanupErrors = [];
    try {
      if (pool) await pool.end();
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    } finally {
      try {
        if (created && schemaOid) await dropOwnedSchema(owner, target, schema, created, sessionUser, schemaOid);
        else if (created) cleanupErrors.push(new Error("Schema OID tasdiqlanmagani uchun cleanup uni o'chirmadi"));
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      } finally {
        try {
          await owner.end();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
    }
    throw cleanupFailure(error, cleanupErrors, "Account Integrity harness setup and cleanup failed");
  }
}

module.exports = { allowedAccountTestUsers, createAccountIntegrityHarness };
