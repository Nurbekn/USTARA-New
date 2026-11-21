const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  parseAllowedSessionUsers,
  quoteSchema,
  testTarget,
} = require("./helpers/testDatabaseTarget");

const enabled = process.env.USTARA_ACCOUNT_INTEGRITY_RERUN_TESTS === "I_AUTHORIZE_TEST_DATABASE";
const migration = fs.readFileSync(path.resolve(__dirname,
  "../database/migrations/20261116_account_profile_deletion_integrity.sql"), "utf8");
const constraintNames = [
  "users_id_role_key",
  "customers_user_role_fkey",
  "barbers_user_role_fkey",
  "customers_role_check",
  "customers_first_name_nonblank_check",
  "customers_last_name_nonblank_check",
  "barbers_role_check",
  "barbers_specialty_check",
  "barbers_first_name_nonblank_check",
  "barbers_last_name_nonblank_check",
  "users_profile_integrity_ct",
  "customers_profile_integrity_ct",
  "barbers_profile_integrity_ct",
];
const triggerNames = [
  "users_role_immutable_trg",
  "users_profile_integrity_ct",
  "customers_profile_parent_lock_trg",
  "barbers_profile_parent_lock_trg",
  "customers_profile_integrity_ct",
  "barbers_profile_integrity_ct",
];
const functionNames = [
  "ustara_reject_user_role_change",
  "ustara_lock_profile_accounts",
  "ustara_assert_profile_invariant",
  "ustara_check_profile_invariant_deferred",
];
const userRoleChangeFunctionBody = `BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'users.role is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END`;
const profileAccountLockFunctionBody = `DECLARE
    v_ids INTEGER[];
    v_old INTEGER;
    v_new INTEGER;
    v_id INTEGER;
  BEGIN
    IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
      FROM unnest(ARRAY[v_old,v_new]) AS candidates(id) WHERE id IS NOT NULL;
    IF v_ids IS NOT NULL THEN
      FOREACH v_id IN ARRAY v_ids LOOP
        PERFORM id FROM users WHERE id=v_id FOR UPDATE;
      END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END`;
const triggerFunctionDiagnosticSpecs = Object.freeze({
  ustara_reject_user_role_change: {
    identityArguments: "",
    returnType: "pg_catalog.trigger",
    sourceBody: userRoleChangeFunctionBody,
    normalizeOuterWhitespace: true,
  },
  ustara_lock_profile_accounts: {
    identityArguments: "",
    returnType: "pg_catalog.trigger",
    sourceBody: profileAccountLockFunctionBody,
    normalizeOuterWhitespace: true,
  },
});

async function catalogSnapshot(client, schema) {
  const constraints = await client.query(`
    SELECT relation.relname AS table_name, constraint_row.conname,
           constraint_row.contype, pg_catalog.pg_get_constraintdef(constraint_row.oid, false) AS definition,
           constraint_row.convalidated, constraint_row.condeferrable, constraint_row.condeferred,
           constraint_row.conkey::text AS conkey, constraint_row.confkey::text AS confkey,
           constraint_row.confdeltype, constraint_row.confupdtype,
           constraint_row.confrelid::regclass::text AS referenced_relation,
           constraint_row.conindid::text AS referenced_index_oid
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = $1 AND constraint_row.conname = ANY($2::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [schema, constraintNames]);
  const indexes = await client.query(`
    SELECT index_relation.relname AS index_name,
           pg_catalog.pg_get_indexdef(index_row.indexrelid) AS definition,
           index_row.indisunique, index_row.indisvalid, index_row.indisready, index_row.indislive,
           index_row.indpred IS NULL AS has_no_predicate,
           index_row.indexprs IS NULL AS has_no_expressions,
           index_row.indnkeyatts, index_row.indnatts, index_row.indkey::text AS indkey
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = table_relation.relnamespace
    WHERE namespace.nspname = $1 AND table_relation.relname = ANY(ARRAY['users','customers','barbers'])
    ORDER BY table_relation.relname, index_relation.relname
  `, [schema]);
  const triggers = await client.query(`
    SELECT relation.relname AS table_name, trigger_row.tgname,
           pg_catalog.pg_get_triggerdef(trigger_row.oid, false) AS definition,
           trigger_row.tgtype, trigger_row.tgenabled, trigger_row.tgdeferrable,
           trigger_row.tginitdeferred, trigger_row.tgconstraint::text AS constraint_oid,
           trigger_row.tgfoid::regprocedure::text AS function_signature,
           pg_catalog.pg_get_functiondef(trigger_row.tgfoid) AS function_definition
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = $1 AND trigger_row.tgname = ANY($2::text[])
    ORDER BY relation.relname, trigger_row.tgname
  `, [schema, triggerNames]);
  const functions = await client.query(`
    SELECT procedure.proname, pg_catalog.pg_get_function_identity_arguments(procedure.oid) AS arguments,
           pg_catalog.pg_get_function_result(procedure.oid) AS return_type,
           procedure.prosecdef, procedure.proconfig, procedure.prosrc,
           pg_catalog.pg_get_functiondef(procedure.oid) AS definition
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = $1 AND procedure.proname = ANY($2::text[])
    ORDER BY procedure.proname, arguments
  `, [schema, functionNames]);
  const marker = await client.query(`
    SELECT version
    FROM ${quoteSchema(schema)}.ustara_schema_migrations
    WHERE version = '20261116_account_profile_deletion_integrity'
  `);
  return {
    constraints: constraints.rows,
    indexes: indexes.rows,
    triggers: triggers.rows,
    functions: functions.rows,
    marker: marker.rows,
  };
}

async function triggerFunctionDiagnostic(client, schema, functionName, spec) {
  const result = await client.query(`
    WITH expected AS (
      SELECT $1::text AS schema_name, $2::text AS function_name,
             $3::text AS identity_arguments, $4::text AS return_type,
             $5::text AS source_body, $6::boolean AS normalize_outer_whitespace
    ), resolved AS (
      SELECT expected.*,
             pg_catalog.to_regprocedure(
               format('%I.%I(%s)', schema_name, function_name, identity_arguments)
             )::oid AS function_oid
      FROM expected
    ), inspected AS (
      SELECT resolved.*, procedure.oid AS catalog_oid, procedure.pronamespace,
             procedure.proname, procedure.pronargs, procedure.proargtypes,
             procedure.prorettype, procedure.prokind, procedure.pronargdefaults,
             procedure.provariadic, procedure.proretset, procedure.proisstrict,
             procedure.provolatile, procedure.proparallel, procedure.prosecdef,
             procedure.proconfig, procedure.prosrc, procedure.proacl, procedure.proowner,
             namespace.nspname AS namespace_name, language.lanname,
             pg_catalog.pg_get_functiondef(procedure.oid) AS function_definition,
             COALESCE(procedure.proacl,
               pg_catalog.acldefault('f', procedure.proowner)) AS effective_acl
      FROM resolved
      LEFT JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=resolved.function_oid
      LEFT JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
      LEFT JOIN pg_catalog.pg_language AS language ON language.oid=procedure.prolang
    )
    SELECT function_oid, catalog_oid, schema_name, function_name,
           identity_arguments AS expected_identity_arguments,
           namespace_name, pronamespace,
           proname, pronargs, proargtypes,
           pg_catalog.pg_get_function_identity_arguments(catalog_oid) AS identity_arguments,
           prorettype, pg_catalog.pg_get_function_result(catalog_oid) AS return_type,
           return_type AS expected_return_type,
           prokind, pronargdefaults, provariadic, proretset, proisstrict,
           provolatile, proparallel, prosecdef, proconfig,
           ARRAY[format('search_path=%s, pg_catalog, pg_temp', format('%I', schema_name))]::text[]
             AS expected_proconfig,
           lanname, prosrc, btrim(prosrc) AS trimmed_prosrc,
           source_body AS expected_prosrc, normalize_outer_whitespace,
           function_definition, proacl, proacl IS NULL AS proacl_is_null,
           COALESCE(proacl, pg_catalog.acldefault('f', proowner)) AS effective_acl,
           EXISTS (
             SELECT 1 FROM pg_catalog.aclexplode(effective_acl) AS acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) AS public_execute_present,
           function_oid IS NOT NULL AS signature_found,
           pronargs IS NOT DISTINCT FROM CASE WHEN identity_arguments = '' THEN 0
             ELSE cardinality(string_to_array(identity_arguments, ',')) END AS argument_count_matches,
           COALESCE(namespace_name=schema_name, false) AS namespace_matches,
           COALESCE(lanname='plpgsql', false) AS language_matches,
           prorettype IS NOT DISTINCT FROM pg_catalog.to_regtype(return_type)::oid
             AS return_type_matches,
           prokind IS NOT DISTINCT FROM 'f' AS prokind_matches,
           pronargdefaults IS NOT DISTINCT FROM 0 AS pronargdefaults_matches,
           provariadic IS NOT DISTINCT FROM 0::oid AS provariadic_matches,
           proretset IS FALSE AS proretset_matches,
           proisstrict IS FALSE AS proisstrict_matches,
           provolatile IS NOT DISTINCT FROM 'v' AS provolatile_matches,
           proparallel IS NOT DISTINCT FROM 'u' AS proparallel_matches,
           prosecdef IS TRUE AS prosecdef_matches,
           proconfig IS NOT DISTINCT FROM
             ARRAY[format('search_path=%s, pg_catalog, pg_temp', format('%I', schema_name))]::text[]
             AS proconfig_matches,
           CASE WHEN normalize_outer_whitespace THEN
             regexp_replace(prosrc,'^[[:space:]]+|[[:space:]]+$','','g')
               IS NOT DISTINCT FROM regexp_replace(source_body,'^[[:space:]]+|[[:space:]]+$','','g')
           ELSE btrim(prosrc) IS NOT DISTINCT FROM source_body END AS prosrc_matches,
           COALESCE(pg_catalog.strpos(function_definition, source_body)>0, false)
             AS function_definition_contains_expected_body,
           NOT EXISTS (
             SELECT 1 FROM pg_catalog.aclexplode(effective_acl) AS acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) AS public_execute_check_matches
    FROM inspected
  `, [schema, functionName, spec.identityArguments, spec.returnType, spec.sourceBody,
    spec.normalizeOuterWhitespace]);
  return result.rows[0] || null;
}

function triggerFunctionValidatorTarget(error, expectedSchema) {
  const prefix = "Account/profile migration: trigger function ";
  const suffix = " has an incorrect signature, body or security configuration; manual review required";
  if (error?.code !== "P0001" || typeof error.message !== "string"
      || !error.message.startsWith(prefix) || !error.message.endsWith(suffix)) return null;

  const target = error.message.slice(prefix.length, -suffix.length);
  const separator = target.lastIndexOf(".");
  if (separator < 0) return null;
  const schema = target.slice(0, separator);
  const functionName = target.slice(separator + 1);
  if (schema !== expectedSchema
      || !Object.prototype.hasOwnProperty.call(triggerFunctionDiagnosticSpecs, functionName)) return null;
  const spec = triggerFunctionDiagnosticSpecs[functionName];
  return { schema, functionName, spec };
}

async function openScenario(t) {
  const { createAccountIntegrityHarness } = require("./helpers/accountIntegrityHarness");
  const harness = await createAccountIntegrityHarness();
  t.after(() => harness.close());
  return harness;
}

async function expectFailClosedRerun(t, corrupt, expectedError) {
  const harness = await openScenario(t);
  const client = await harness.pool.connect();
  try {
    await corrupt(client, quoteSchema(harness.schema));
    const before = await catalogSnapshot(client, harness.schema);
    let migrationError;
    try {
      await client.query(migration);
    } catch (error) {
      migrationError = error;
    }
    assert.ok(migrationError, "O'zgartirilgan schema uchun migration rerun xato berishi kerak");
    assert.match(migrationError.message, expectedError);
    await client.query("ROLLBACK");
    const after = await catalogSnapshot(client, harness.schema);
    assert.deepEqual(after, before, "Rerun xatosi persistent obyektlarni yoki marker'ni o'zgartirmasligi kerak");
  } finally {
    client.release();
  }
}

test("Account Integrity migration marker-present rerun catalog validation (PostgreSQL)",
  { skip: !enabled }, async (t) => {
    assert.equal(process.env.NODE_ENV, "test", "NODE_ENV=test talab qilinadi");
    assert.equal(process.env.USTARA_ACCOUNT_INTEGRITY_TESTS, "I_AUTHORIZE_TEST_DATABASE",
      "Umumiy Account Integrity test opt-in'i ham talab qilinadi");
    const allowedUsers = parseAllowedSessionUsers(process.env.USTARA_ACCOUNT_INTEGRITY_TEST_USERS,
      "USTARA_ACCOUNT_INTEGRITY_TEST_USERS");
    const target = testTarget(process.env.USTARA_TEST_DATABASE_URL,
      "Account Integrity migration rerun test database", allowedUsers);
    assert.ok(!["ustara_test_owner", "ustara_test_app"].includes(target.sessionUser),
      "Migration rerun test role API suite role'laridan alohida bo'lishi kerak");

    await t.test("birinchi migration va normal rerun catalog holatini o'zgartirmaydi", async (scenario) => {
      const harness = await openScenario(scenario);
      const client = await harness.pool.connect();
      try {
        const before = await catalogSnapshot(client, harness.schema);
        assert.deepEqual(before.marker, [{ version: "20261116_account_profile_deletion_integrity" }]);
        assert.equal(before.constraints.length, constraintNames.length, "Kutilgan UNIQUE, FK, deferred constraint va CHECK obyektlari mavjud bo'lishi kerak");
        assert.equal(before.triggers.length, triggerNames.length, "Barcha kutilgan trigger'lar mavjud bo'lishi kerak");
        assert.equal(before.functions.length, functionNames.length, "Barcha kutilgan trigger function'lar mavjud bo'lishi kerak");
        assert.ok(before.indexes.some((index) => index.index_name === "users_id_role_key"), "Parent UNIQUE index mavjud bo'lishi kerak");
        let migrationError;
        try {
          await client.query(migration);
        } catch (error) {
          migrationError = error;
        }
        if (migrationError) {
          const diagnosticTarget = triggerFunctionValidatorTarget(migrationError, harness.schema);
          if (diagnosticTarget) {
            let rollbackError = null;
            let functionCatalog = null;
            let functionDiagnosticError = null;
            try {
              await client.query("ROLLBACK");
            } catch (error) {
              rollbackError = error.message;
            }
            try {
              functionCatalog = await triggerFunctionDiagnostic(client, diagnosticTarget.schema,
                diagnosticTarget.functionName, diagnosticTarget.spec);
            } catch (error) {
              functionDiagnosticError = error.message;
            }
            try {
              console.error("Account Integrity rerun function diagnostic:", JSON.stringify({
                migrationError: migrationError.message,
                diagnosticTarget: {
                  schema: diagnosticTarget.schema,
                  functionName: diagnosticTarget.functionName,
                },
                rollbackError,
                functionCatalog,
                diagnosticError: functionDiagnosticError,
              }, null, 2));
            } catch {}
          }
          throw migrationError;
        }
        const after = await catalogSnapshot(client, harness.schema);
        assert.deepEqual(after, before, "Muvaffaqiyatli rerun obyekt definition'larini o'zgartirmasligi kerak");
      } finally {
        client.release();
      }
    });

    await t.test("noto'g'ri parent UNIQUE constraint aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`ALTER TABLE ${schema}.customers DROP CONSTRAINT customers_user_role_fkey`);
        await client.query(`ALTER TABLE ${schema}.barbers DROP CONSTRAINT barbers_user_role_fkey`);
        await client.query(`ALTER TABLE ${schema}.users DROP CONSTRAINT users_id_role_key`);
        await client.query(`ALTER TABLE ${schema}.users ADD CONSTRAINT users_id_role_key UNIQUE (id, phone)`);
      }, /users_id_role_key has an incorrect or invalid/);
    });

    await t.test("noto'g'ri composite FK column mapping aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`CREATE UNIQUE INDEX users_role_id_rerun_fixture_idx ON ${schema}.users(role, id)`);
        await client.query(`ALTER TABLE ${schema}.customers DROP CONSTRAINT customers_user_role_fkey`);
        await client.query(`ALTER TABLE ${schema}.customers ADD CONSTRAINT customers_user_role_fkey
          FOREIGN KEY (role, user_id) REFERENCES ${schema}.users(role, id) ON DELETE CASCADE`);
      }, /customers_user_role_fkey has incorrect columns/);
    });

    await t.test("noto'g'ri composite FK ON DELETE action aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`ALTER TABLE ${schema}.customers DROP CONSTRAINT customers_user_role_fkey`);
        await client.query(`ALTER TABLE ${schema}.customers ADD CONSTRAINT customers_user_role_fkey
          FOREIGN KEY (user_id, role) REFERENCES ${schema}.users(id, role) ON DELETE RESTRICT`);
      }, /customers_user_role_fkey has incorrect columns/);
    });

    await t.test("deferred constraint trigger konfiguratsiyasi aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`DROP TRIGGER customers_profile_integrity_ct ON ${schema}.customers`);
        await client.query(`CREATE CONSTRAINT TRIGGER customers_profile_integrity_ct
          AFTER INSERT OR DELETE OR UPDATE OF user_id ON ${schema}.customers
          DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
          EXECUTE FUNCTION ${schema}.ustara_check_profile_invariant_deferred()`);
      }, /deferred constraint trigger customers_profile_integrity_ct has no correctly configured constraint/);
    });

    await t.test("trigger function body o'zgargani aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`CREATE OR REPLACE FUNCTION ${schema}.ustara_assert_profile_invariant(p_user_id INTEGER)
          RETURNS void LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = ${schema}, pg_catalog, pg_temp
          AS $$ BEGIN RETURN; END $$`);
      }, /ustara_assert_profile_invariant has an incorrect signature, body or security configuration/);
    });

    await t.test("noto'g'ri CHECK expression aniqlanadi va tuzatilmaydi", async (scenario) => {
      await expectFailClosedRerun(scenario, async (client, schema) => {
        await client.query(`ALTER TABLE ${schema}.customers DROP CONSTRAINT customers_role_check`);
        await client.query(`ALTER TABLE ${schema}.customers ADD CONSTRAINT customers_role_check CHECK (role IN ('customer', 'barber'))`);
      }, /a role, name or specialty CHECK definition is missing or incorrect/);
    });
  });
