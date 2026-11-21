const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migration = fs.readFileSync(path.resolve(__dirname,
  "../database/migrations/20261116_account_profile_deletion_integrity.sql"), "utf8");
const rerunStart = migration.indexOf("-- Marker-present validation path.");
const firstRunStart = migration.indexOf("-- First-run schema creation path begins below.");
const rerunBranch = migration.slice(rerunStart, firstRunStart);

test("rerun validates users_id_role_key columns and its exact unique index", () => {
  assert.notEqual(rerunStart, -1);
  assert.match(rerunBranch, /c\.contype='u'/);
  assert.match(rerunBranch, /c\.convalidated/);
  assert.match(rerunBranch, /c\.conkey=ARRAY\[v_user_id_att,v_user_role_att\]::smallint\[\]/);
  assert.match(rerunBranch, /c\.conindid/);
  assert.match(rerunBranch, /i\.indisunique AND i\.indisvalid AND i\.indisready AND i\.indislive/);
  assert.match(rerunBranch, /i\.indpred IS NULL AND i\.indexprs IS NULL/);
  assert.match(rerunBranch, /i\.indnkeyatts=2 AND i\.indnatts=2/);
  assert.match(rerunBranch, /i\.indkey\[0\]=v_user_id_att AND i\.indkey\[1\]=v_user_role_att/);
});

test("rerun validates both composite foreign-key mappings and referenced index", () => {
  assert.match(rerunBranch, /customers_user_role_fkey/);
  assert.match(rerunBranch, /barbers_user_role_fkey/);
  assert.match(rerunBranch, /c\.confrelid=v_users_oid/);
  assert.match(rerunBranch, /c\.conkey=ARRAY\[v_fk_spec\.user_att,v_fk_spec\.role_att\]::smallint\[\]/);
  assert.match(rerunBranch, /c\.confkey=ARRAY\[v_user_id_att,v_user_role_att\]::smallint\[\]/);
  assert.match(rerunBranch, /c\.conindid=v_role_key_index_oid/);
  assert.match(rerunBranch, /c\.confdeltype='c'/);
  assert.match(rerunBranch, /c\.convalidated AND NOT c\.condeferrable AND NOT c\.condeferred/);
});

test("rerun validates constraint-trigger attachment, event flags, function and enabled state", () => {
  assert.match(rerunBranch, /c\.contype='t'/);
  assert.match(rerunBranch, /c\.condeferrable AND c\.condeferred/);
  assert.match(rerunBranch, /t\.tgtype=v_trigger_spec\.expected_type/);
  assert.match(rerunBranch, /FROM unnest\(t\.tgattr::smallint\[\]\) WITH ORDINALITY[\s\S]*?ORDER BY actual_attribute\.ordinality\s*\)=v_trigger_spec\.expected_attributes/);
  assert.match(rerunBranch, /t\.tgconstraint=v_trigger_constraint_oid/);
  assert.match(rerunBranch, /t\.tgfoid=v_function_oid/);
  assert.match(rerunBranch, /t\.tgenabled='O'/);
  for (const eventMask of ["19", "13", "29", "31"]) {
    assert.match(rerunBranch, new RegExp(`,${eventMask},`));
  }
});

test("rerun validates trigger function identity, body and security configuration", () => {
  assert.match(rerunBranch, /to_regprocedure\(format\('%I\.%I\(%s\)'/);
  assert.match(rerunBranch, /p\.pronamespace=to_regnamespace\(format\('%I',v_schema\)\)/);
  assert.match(rerunBranch, /v_function\.lanname IS DISTINCT FROM 'plpgsql'/);
  assert.match(rerunBranch, /v_function\.prorettype IS DISTINCT FROM to_regtype/);
  assert.match(rerunBranch, /NOT v_function\.prosecdef/);
  assert.match(rerunBranch, /v_function\.proconfig IS DISTINCT FROM ARRAY\[v_expected_search_path\]::text\[\]/);
  assert.match(rerunBranch, /regexp_replace\(v_function\.prosrc,[\s\S]*?IS DISTINCT FROM regexp_replace\(v_function_spec\.source_body,/);
  assert.match(rerunBranch, /pg_get_functiondef\(v_function_oid\)/);
  assert.match(rerunBranch, /pg_catalog\.strpos\(v_function_definition,v_function_spec\.source_body\)=0/);
  assert.match(rerunBranch, /aclexplode\(/);
});

test("rerun compares role, name and specialty CHECK definitions through PostgreSQL deparsing", () => {
  for (const name of [
    "customers_role_check", "barbers_role_check", "barbers_specialty_check",
    "customers_first_name_nonblank_check", "customers_last_name_nonblank_check",
    "barbers_first_name_nonblank_check", "barbers_last_name_nonblank_check",
  ]) assert.ok(rerunBranch.includes(name), `missing expected CHECK ${name}`);
  assert.match(rerunBranch, /pg_get_constraintdef\(actual\.oid,false\) IS DISTINCT FROM pg_get_constraintdef\(expected\.oid,false\)/);
  assert.match(rerunBranch, /NOT actual\.convalidated/);
  assert.match(rerunBranch, /role='customer'/);
  assert.match(rerunBranch, /role='barber'/);
  assert.match(rerunBranch, /specialty IN \('barber','cosmetolog','stylist'\)/);
  assert.match(rerunBranch, /btrim\(first_name,U&/);
  assert.match(rerunBranch, /btrim\(last_name,U&/);
});

test("marker-present path fails closed and does not repair persistent objects or rewrite marker", () => {
  assert.notEqual(firstRunStart, -1);
  assert.match(migration.slice(0, rerunStart), /IF v_applied THEN/);
  assert.match(rerunBranch, /manual review required/);
  assert.match(rerunBranch, /RETURN;/);
  assert.doesNotMatch(rerunBranch, /INSERT\s+INTO\s+ustara_schema_migrations/i);
  assert.doesNotMatch(rerunBranch, /UPDATE\s+ustara_schema_migrations/i);
  assert.doesNotMatch(rerunBranch, /ALTER\s+TABLE\s+(?:%I\.)?(?:users|customers|barbers)\b/i);
  assert.doesNotMatch(rerunBranch, /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TRIGGER)\b/i);
  assert.doesNotMatch(rerunBranch, /DROP\s+(?:CONSTRAINT|FUNCTION|TRIGGER)\b/i);
  assert.match(rerunBranch, /CREATE TEMP TABLE/);
  assert.match(rerunBranch, /ALTER TABLE pg_temp\./);
});
