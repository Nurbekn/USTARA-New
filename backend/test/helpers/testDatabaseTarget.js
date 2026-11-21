const { TEST_DATABASE, validateLocalTestUrl } = require("../../database/poolConfig");

const TEST_SCHEMA_PATTERN = /^(?:test|account_integrity|admin_accounts_test|profile_names|migration_test|ustara_bootstrap_test|test_overlap_migration)_[a-z0-9_]+$/;

function quoteSchema(name) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("Test schema nomi noto'g'ri");
  return `"${name}"`;
}

function parseAllowedSessionUsers(value, label = "Test database") {
  const users = String(value || "").split(",").map((user) => user.trim()).filter(Boolean);
  if (!users.length || new Set(users).size !== users.length
      || users.some((user) => !/^[a-z_][a-z0-9_]{0,62}$/.test(user))) {
    throw new Error(`${label} uchun ruxsat etilgan session user'lar aniq ko'rsatilishi kerak`);
  }
  return users;
}

function testTarget(value, label = "Test database", allowedSessionUsers) {
  const target = validateLocalTestUrl(value, label);
  if (allowedSessionUsers !== undefined) {
    const allowed = [...new Set(allowedSessionUsers)];
    if (!allowed.length || allowed.some((user) => typeof user !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/.test(user))) {
      throw new Error(`${label} ruxsat etilgan test session user ro'yxati noto'g'ri`);
    }
    if (!allowed.includes(target.sessionUser)) {
      throw new Error(`${label} session user ruxsat etilgan test user'laridan biri emas`);
    }
    target.allowedSessionUsers = allowed;
  }
  return target;
}

async function assertTestConnection(queryable, target, expectedUser = target.sessionUser) {
  if (target.allowedSessionUsers && !target.allowedSessionUsers.includes(expectedUser)) {
    throw new Error("Kutilgan database user ruxsat etilgan test user'laridan biri emas");
  }
  if (target.sessionUser !== expectedUser) {
    throw new Error("Test URL session user'i kutilgan database user'iga mos emas");
  }
  const result = await queryable.query(`
    SELECT current_database() AS database,
           session_user,
           current_user,
           EXISTS (
             SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = current_user AND rolsuper
           ) AS is_superuser
  `);
  const identity = result.rows[0];
  if (identity?.database !== TEST_DATABASE
      || identity?.session_user !== expectedUser
      || identity?.current_user !== expectedUser
      || identity?.is_superuser !== false) {
    throw new Error("Test database/user identity noto'g'ri yoki session superuser; test yozuvlari bajarilmadi");
  }
  return identity;
}

async function assertTestSchema(queryable, target, schema, expectedUser = target.sessionUser) {
  if (!TEST_SCHEMA_PATTERN.test(schema) || schema === "public") {
    throw new Error("Testlar uchun public yoki tanilmagan schema nomidan foydalanish taqiqlanadi");
  }
  await assertTestConnection(queryable, target, expectedUser);
  const result = await queryable.query(`
    SELECT current_schema() AS schema,
           current_setting('search_path') AS search_path,
           current_schemas(false)::text[] AS resolved_search_path
  `);
  const identity = result.rows[0];
  if (identity?.schema !== schema || identity?.resolved_search_path?.[0] !== schema) {
    throw new Error("Test schema search_path birinchi o'rinda emas; test yozuvlari bajarilmadi");
  }
  return identity;
}

async function assertOwnedTestSchema(queryable, target, schema, expectedUser = target.sessionUser, expectedOid) {
  await assertTestSchema(queryable, target, schema, expectedUser);
  const result = await queryable.query(`
    SELECT namespace.oid::text AS schema_oid,
           namespace.nspowner = role.oid AS owned_by_current_user
    FROM pg_catalog.pg_namespace AS namespace
    JOIN pg_catalog.pg_roles AS role ON role.rolname = current_user
    WHERE namespace.nspname = $1
  `, [schema]);
  if (result.rows[0]?.owned_by_current_user !== true
      || (expectedOid !== undefined && result.rows[0]?.schema_oid !== String(expectedOid))) {
    throw new Error("Cleanup faqat test jarayoni yaratgan va egalik qiladigan schema'ni o'chirishi mumkin");
  }
  return result.rows[0].schema_oid;
}

async function dropOwnedSchema(queryable, target, schema, created, expectedUser = target.sessionUser, expectedOid) {
  if (!created) return;
  await assertOwnedTestSchema(queryable, target, schema, expectedUser, expectedOid);
  await queryable.query("ROLLBACK").catch(() => {});
  await assertOwnedTestSchema(queryable, target, schema, expectedUser, expectedOid);
  await queryable.query(`DROP SCHEMA ${quoteSchema(schema)} CASCADE`);
}

module.exports = {
  assertOwnedTestSchema,
  assertTestConnection,
  assertTestIdentity: assertTestConnection,
  assertTestSchema,
  dropOwnedSchema,
  parseAllowedSessionUsers,
  quoteSchema,
  testTarget,
};
