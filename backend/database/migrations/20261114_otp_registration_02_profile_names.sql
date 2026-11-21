-- Apply AFTER 20261114_otp_registration.sql. No automatic legacy-name splitting.
-- Deploy split-name readers/writers together with this migration.
-- Refuse to discard legacy-only names: populate first_name/last_name explicitly
-- after a reviewed data audit, then retry. No truncation, CASCADE or down migration.
-- This intentional schema change archives the original OTP baseline in its
-- comment, then removes only the two columns and their PG18 NOT NULL signatures.
-- The original
-- OTP migration remains unchanged and its rerun still detects unrelated drift.
-- Deployment contract: run standalone in a maintenance window, with other DDL
-- stopped/drained (including index-only DDL and schema/type/collation renames).
-- Cooperating DDL tools must first take the same transaction advisory lock:
--   pg_advisory_xact_lock(hashtext(current_database()),
--                         hashtext('ustara-schema-ddl:' || target_schema)).
-- Advisory locks do NOT restrain non-cooperating owners/superusers. Table locks
-- alone cannot freeze every object represented by pg_get_* definitions: e.g.
-- ALTER INDEX RENAME takes a lock on the index, not necessarily its parent.
-- Do not deploy concurrently with such DDL; direct system-catalog writes are
-- outside this migration's safety model. No new stored helper/lock objects.
-- Lock order below is fixed, with tracking first (also serializes the old OTP
-- migration). All ten locks are acquired BEFORE baseline/data/manifest reads:
-- * tracking: EXCLUSIVE, stabilizing markers and serializing migrations;
-- * customers/barbers: ACCESS EXCLUSIVE, covering validation and DROP COLUMN;
-- * other tables: SHARE UPDATE EXCLUSIVE, allowing ROW SHARE / ROW EXCLUSIVE
--   DML locks while excluding SHARE/SUE/SRX/EXCLUSIVE/ACCESS EXCLUSIVE requests
--   on those same tables (e.g. CREATE INDEX, CREATE INDEX CONCURRENTLY, VACUUM).
-- SUE does not conflict with ROW EXCLUSIVE or ACCESS SHARE and is NOT a blanket
-- DDL prohibition. The deployment/advisory-lock contract covers that gap.
-- The covered tables must be ordinary, non-inherited tables; reject inheritance
-- rather than letting DROP/implicit descendant locks escape the declared scope.
-- Profile reads/writes and migration-marker writes wait; foreign keys can also
-- make other DML wait. This is not a zero-downtime migration. Locks persist to
-- transaction end. Use a runner that stops on error and rolls back/disconnects;
-- no enclosing transaction and no idle pause before COMMIT.
BEGIN ISOLATION LEVEL READ COMMITTED;
-- Transaction-local limits, not global settings. lock_timeout is per lock wait;
-- statement_timeout bounds the DO statement, including scans/waits. Review
-- these deployment budgets before running against a large schema/data set.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_otp_registration_02_profile_names';
  table_names CONSTANT TEXT[] := ARRAY[
    'ustara_schema_migrations', 'users', 'customers', 'barbers', 'admin_accounts',
    'registration_phone_limits', 'pending_registrations',
    'registration_otp_history', 'registration_security_events',
    'registration_admin_actions'
  ];
  prerequisite_versions CONSTANT TEXT[] := ARRAY[
    '20261113_00_users_foundation', '20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts', '20261114_otp_registration'
  ];
  object_name TEXT;
  lock_mode TEXT;
  marker_count INTEGER;
  table_oid OID;
  table_signature JSONB;
  actual_manifest JSONB;
  expected_manifest JSONB;
  target_manifest JSONB;
  original_baseline JSONB;
  archived_baseline JSONB;
  checked_baseline JSONB;
  baselines_to_check JSONB[];
  legacy_column JSONB;
  baseline_comment TEXT;
  already_applied BOOLEAN;
  not_null_constraints JSONB;
  not_null_entry JSONB;
  phase INTEGER;
  missing_names BOOLEAN;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Profile names migration: invalid active schema';
  END IF;
  -- Explicit pg_temp LAST prevents its implicit first-place relation/type lookup.
  -- Keep the predecessor's target-first rendering of pg_get_* / regcollation.
  -- Every application relation below is nevertheless schema-qualified.
  PERFORM pg_catalog.set_config('search_path', format('%I, pg_catalog, pg_temp', schema_name), true);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  FOREACH object_name IN ARRAY table_names LOOP
    table_oid := pg_catalog.to_regclass(format('%I.%I', schema_name, object_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class
      WHERE oid=table_oid AND relkind='r' AND relpersistence<>'t'
    ) THEN
      RAISE EXCEPTION 'Profile names migration: missing/incompatible table %.%', schema_name, object_name;
    END IF;
    lock_mode := CASE WHEN object_name='ustara_schema_migrations' THEN 'EXCLUSIVE'
                      WHEN object_name IN ('customers','barbers') THEN 'ACCESS EXCLUSIVE'
                      ELSE 'SHARE UPDATE EXCLUSIVE' END;
    -- ONLY avoids implicitly locking inheritance descendants out of this order.
    EXECUTE format('LOCK TABLE ONLY %I.%I IN %s MODE', schema_name, object_name, lock_mode);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_inherits i
    JOIN pg_catalog.pg_class c ON c.oid=i.inhrelid OR c.oid=i.inhparent
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=schema_name AND c.relname=ANY(table_names)
  ) THEN
    RAISE EXCEPTION 'Profile names migration: inherited/partitioned table relationships require separate review';
  END IF;
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)', schema_name)
    INTO marker_count USING prerequisite_versions;
  IF marker_count <> cardinality(prerequisite_versions) THEN
    RAISE EXCEPTION 'Profile names migration: prerequisite migration markers missing';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)', schema_name)
    INTO already_applied USING version_name;
  baseline_comment := pg_catalog.obj_description(
    pg_catalog.to_regclass(format('%I.registration_phone_limits', schema_name)), 'pg_class');
  BEGIN
    original_baseline := baseline_comment::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Profile names migration: malformed OTP baseline';
  END;
  IF jsonb_typeof(original_baseline) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Profile names migration: missing/incompatible OTP baseline';
  END IF;
  IF already_applied THEN
    IF original_baseline->>'profile_names_migration' IS DISTINCT FROM version_name
       OR jsonb_typeof(original_baseline->'profile_names_previous_baseline') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Profile names migration: recorded migration baseline missing';
    END IF;
    archived_baseline := original_baseline->'profile_names_previous_baseline';
  ELSIF original_baseline ? 'profile_names_migration'
        OR original_baseline ? 'profile_names_previous_baseline' THEN
    RAISE EXCEPTION 'Profile names migration: untracked baseline change';
  ELSE
    archived_baseline := original_baseline;
  END IF;
  -- Validate types BEFORE set-returning JSONB functions; malformed arrays/scalars
  -- must fail closed, without relying on SQL boolean-expression evaluation order.
  baselines_to_check := ARRAY[original_baseline];
  IF already_applied THEN
    baselines_to_check := array_append(baselines_to_check, archived_baseline);
  END IF;
  FOREACH checked_baseline IN ARRAY baselines_to_check LOOP
    IF jsonb_typeof(checked_baseline) IS DISTINCT FROM 'object'
       OR checked_baseline->>'version' IS DISTINCT FROM '20261114_otp_registration'
       OR checked_baseline->>'format' IS DISTINCT FROM '1'
       OR jsonb_typeof(checked_baseline->'tables') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Profile names migration: malformed current/archived baseline header';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(checked_baseline->'tables')) <> cardinality(table_names)
       OR NOT (checked_baseline->'tables' ?& table_names) THEN
      RAISE EXCEPTION 'Profile names migration: current/archived baseline must contain the expected ten tables';
    END IF;
    FOREACH object_name IN ARRAY table_names LOOP
      table_signature := checked_baseline->'tables'->object_name;
      IF jsonb_typeof(table_signature) IS DISTINCT FROM 'object'
         OR jsonb_typeof(table_signature->'table') IS DISTINCT FROM 'object'
         OR jsonb_typeof(table_signature->'columns') IS DISTINCT FROM 'array'
         OR jsonb_typeof(table_signature->'constraints') IS DISTINCT FROM 'array'
         OR jsonb_typeof(table_signature->'indexes') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Profile names migration: malformed baseline signature for %', object_name;
      END IF;
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(table_signature->'columns') AS entry(item)
        WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
           OR coalesce(item->>'name', '')=''
           OR jsonb_typeof(item->'position') IS DISTINCT FROM 'number'
           OR coalesce(item->>'position', '') !~ '^[1-9][0-9]*$'
      ) THEN
        RAISE EXCEPTION 'Profile names migration: malformed baseline columns for %', object_name;
      END IF;
      IF (SELECT count(DISTINCT item->>'name') FROM jsonb_array_elements(table_signature->'columns') AS entry(item))
           <> jsonb_array_length(table_signature->'columns')
         OR (SELECT count(DISTINCT item->>'position') FROM jsonb_array_elements(table_signature->'columns') AS entry(item))
           <> jsonb_array_length(table_signature->'columns') THEN
        RAISE EXCEPTION 'Profile names migration: duplicate baseline column name/position in %', object_name;
      END IF;
    END LOOP;
  END LOOP;
  IF archived_baseline ? 'profile_names_migration'
     OR archived_baseline ? 'profile_names_previous_baseline' THEN
    RAISE EXCEPTION 'Profile names migration: archive must be the original predecessor baseline';
  END IF;
  target_manifest := archived_baseline->'tables';
  FOREACH object_name IN ARRAY ARRAY['customers','barbers'] LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(target_manifest->object_name->'columns') AS entry(item)
        WHERE item->>'name'='name') <> 1 THEN
      RAISE EXCEPTION 'Profile names migration: archive must contain exactly one legacy name column in %', object_name;
    END IF;
    SELECT item INTO legacy_column
    FROM jsonb_array_elements(target_manifest->object_name->'columns') AS entry(item)
    WHERE item->>'name'='name';
    IF jsonb_typeof(legacy_column) IS DISTINCT FROM 'object'
       OR legacy_column->>'type' IS DISTINCT FROM 'character varying(50)'
       OR coalesce(legacy_column->>'position', '') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Profile names migration: malformed archived legacy name column in %', object_name;
    END IF;
    -- This entry is intentionally removed before equality comparison, so check
    -- its full shape separately rather than silently discarding malformed JSON.
    IF (SELECT count(*) FROM jsonb_object_keys(legacy_column)) <> 8
       OR NOT (legacy_column ?& ARRAY['name','position','type','not_null','identity','generated','collation','default'])
       OR jsonb_typeof(legacy_column->'not_null') IS DISTINCT FROM 'boolean'
       OR legacy_column->>'identity' IS DISTINCT FROM ''
       OR coalesce(legacy_column->>'generated', '?') NOT IN ('','s')
       OR jsonb_typeof(legacy_column->'collation') IS DISTINCT FROM 'string'
       OR jsonb_typeof(legacy_column->'default') NOT IN ('null','string')
       OR (legacy_column->>'position')::numeric > 32767 THEN
      RAISE EXCEPTION 'Profile names migration: incompatible archived legacy name definition in %', object_name;
    END IF;
    -- PostgreSQL 18 catalogs NOT NULL separately (contype='n'). Only this
    -- column's exact definition belongs to the approved delta; retain all others.
    SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb) INTO not_null_constraints
    FROM jsonb_array_elements(target_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
    WHERE item->>'type'='n' AND item->>'definition'='NOT NULL name';
    IF jsonb_array_length(not_null_constraints)>1 THEN
      RAISE EXCEPTION 'Profile names migration: duplicate NOT NULL constraint';
    END IF;
    FOR not_null_entry IN SELECT value FROM jsonb_array_elements(not_null_constraints) LOOP
      IF jsonb_typeof(not_null_entry) IS DISTINCT FROM 'object'
         OR (SELECT count(*) FROM jsonb_object_keys(not_null_entry))<>6
         OR NOT (not_null_entry ?& ARRAY['name','type','definition','validated','deferrable','deferred'])
         OR jsonb_typeof(not_null_entry->'name') IS DISTINCT FROM 'string'
         OR coalesce(not_null_entry->>'name','')=''
         OR not_null_entry->'validated' IS DISTINCT FROM 'true'::jsonb
         OR not_null_entry->'deferrable' IS DISTINCT FROM 'false'::jsonb
         OR not_null_entry->'deferred' IS DISTINCT FROM 'false'::jsonb THEN
        RAISE EXCEPTION 'Profile names migration: incompatible NOT NULL constraint';
      END IF;
    END LOOP;
    IF jsonb_array_length(not_null_constraints)>0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(target_manifest->object_name->'columns') AS e(item)
      WHERE item->>'name'='name' AND item->'not_null'='true'::jsonb
    ) THEN
      RAISE EXCEPTION 'Profile names migration: archived NOT NULL disagrees with column';
    END IF;
    target_manifest := jsonb_set(target_manifest, ARRAY[object_name,'constraints'],
      (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
       FROM jsonb_array_elements(target_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
       WHERE item->>'type' IS DISTINCT FROM 'n' OR item->>'definition' IS DISTINCT FROM 'NOT NULL name'));
    SELECT jsonb_set(target_manifest, ARRAY[object_name,'columns'],
      (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
       FROM jsonb_array_elements(target_manifest->object_name->'columns') WITH ORDINALITY AS entry(item, ordinal)
       WHERE item->>'name' <> 'name')) INTO target_manifest;
  END LOOP;
  IF already_applied AND target_manifest IS DISTINCT FROM original_baseline->'tables' THEN
    RAISE EXCEPTION 'Profile names migration: archive differs from current baseline beyond the two approved column removals';
  END IF;
  expected_manifest := original_baseline->'tables';
  -- Pass 1 validates the full predecessor baseline; pass 2 proves that only
  -- the two approved columns and their NOT NULL constraints disappeared.
  -- Any other change rolls back all DDL.
  FOR phase IN 1..2 LOOP
    actual_manifest := '{}'::jsonb;
  FOREACH object_name IN ARRAY table_names LOOP
    table_oid := pg_catalog.to_regclass(format('%I.%I', schema_name, object_name));
    SELECT jsonb_build_object(
      'table', jsonb_build_object(
        'kind', c.relkind, 'persistence', c.relpersistence,
        'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity,
        'options', c.reloptions
      ),
      'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', a.attname, 'position', a.attnum,
        'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
        'identity', a.attidentity, 'generated', a.attgenerated,
        'collation', CASE WHEN a.attcollation=0 THEN NULL
                          ELSE a.attcollation::regcollation::text END,
        'default', pg_get_expr(d.adbin, d.adrelid)
      ) ORDER BY a.attnum), '[]'::jsonb)
        FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', k.conname, 'type', k.contype,
        'definition', pg_get_constraintdef(k.oid, false),
        'validated', k.convalidated, 'deferrable', k.condeferrable,
        'deferred', k.condeferred
      ) ORDER BY k.conname), '[]'::jsonb)
        FROM pg_catalog.pg_constraint k WHERE k.conrelid=table_oid),
      'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid),
        'unique', i.indisunique, 'primary', i.indisprimary,
        'valid', i.indisvalid, 'ready', i.indisready,
        'live', i.indislive, 'exclusion', i.indisexclusion,
        'options', ic.reloptions
      ) ORDER BY ic.relname), '[]'::jsonb)
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid=table_oid)
    ) INTO table_signature FROM pg_catalog.pg_class c WHERE c.oid=table_oid;
    actual_manifest := actual_manifest || jsonb_build_object(object_name, table_signature);
  END LOOP;

    IF actual_manifest IS DISTINCT FROM expected_manifest THEN
      RAISE EXCEPTION 'Profile names migration: schema drift during phase %; no changes committed', phase;
    END IF;
    IF phase=1 THEN
      FOREACH object_name IN ARRAY ARRAY['customers','barbers'] LOOP
        table_oid := pg_catalog.to_regclass(format('%I.%I', schema_name, object_name));
        IF (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid=table_oid
            AND attname IN ('first_name','last_name') AND NOT attisdropped
            AND atttypid='character varying'::regtype AND atttypmod=84) <> 2 THEN
          RAISE EXCEPTION 'Profile names migration: expected VARCHAR(80) columns missing in %', object_name;
        END IF;
        IF already_applied THEN
          IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=table_oid AND attname='name' AND NOT attisdropped) THEN
            RAISE EXCEPTION 'Profile names migration: legacy column reappeared in %', object_name;
          END IF;
        ELSE
          IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=table_oid AND attname='name'
                        AND NOT attisdropped AND atttypid='character varying'::regtype AND atttypmod=54) THEN
            RAISE EXCEPTION 'Profile names migration: expected legacy VARCHAR(50) column missing in %', object_name;
          END IF;
          EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE first_name IS NULL OR last_name IS NULL
                         OR btrim(first_name)=%L OR btrim(last_name)=%L)', schema_name, object_name, '', '')
            INTO missing_names;
          IF missing_names THEN
            RAISE EXCEPTION 'Profile names migration: % needs reviewed first_name/last_name backfill; legacy names will not be guessed or discarded', object_name;
          END IF;
        END IF;
      END LOOP;
      IF already_applied THEN RETURN; END IF;
      EXECUTE format('ALTER TABLE %I.customers DROP COLUMN name RESTRICT', schema_name);
      EXECUTE format('ALTER TABLE %I.barbers DROP COLUMN name RESTRICT', schema_name);
      expected_manifest := target_manifest;
    END IF;
  END LOOP;
  EXECUTE format('COMMENT ON TABLE %I.registration_phone_limits IS %L', schema_name,
    (original_baseline || jsonb_build_object(
      'tables', target_manifest,
      'profile_names_migration', version_name,
      'profile_names_previous_baseline', original_baseline
    ))::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)', schema_name)
    USING version_name;
END $$;
COMMIT;
