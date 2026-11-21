-- Apply AFTER 20261114_otp_registration_02_profile_names.sql, before deploying
-- specialty-aware registration writers. No guessed defaults, backfill or deletes.
-- Existing barber profiles / pending barber registrations require explicit cleanup
-- in a separately approved operation; this migration refuses them unchanged.
-- Run standalone, with an error-stopping runner, in a maintenance window. Stop
-- other DDL (including index-only/schema/type/collation renames). Cooperating DDL
-- tools must take the same advisory lock. Locks cannot restrain non-cooperators.
-- Deterministic order: tracking EXCLUSIVE, changed tables ACCESS EXCLUSIVE,
-- others SHARE UPDATE EXCLUSIVE (permits ordinary DML, not a blanket DDL lock).
-- Foreign keys can make additional DML wait; this is not zero-downtime deployment.
-- Preserve all predecessor archives verbatim and advance the current OTP manifest.
-- After applying, run only unapplied migrations: the older profile-names rerun
-- deliberately rejects subsequent manifest changes. Original OTP rerun can still
-- validate the advanced current manifest; it does not restore missing objects.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_otp_registration_03_barber_specialty';
  predecessor CONSTANT TEXT := '20261114_otp_registration_02_profile_names';
  table_names CONSTANT TEXT[] := ARRAY[
    'ustara_schema_migrations', 'users', 'customers', 'barbers', 'admin_accounts',
    'registration_phone_limits', 'pending_registrations', 'registration_otp_history',
    'registration_security_events', 'registration_admin_actions'
  ];
  prerequisites CONSTANT TEXT[] := ARRAY[
    '20261113_00_users_foundation', '20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts', '20261114_otp_registration',
    '20261114_otp_registration_02_profile_names'
  ];
  object_name TEXT;
  lock_mode TEXT;
  constraint_name TEXT;
  table_oid OID;
  marker_count INTEGER;
  table_signature JSONB;
  actual_manifest JSONB;
  reduced_manifest JSONB;
  baseline JSONB;
  previous_baseline JSONB;
  profile_archive JSONB;
  profile_manifest JSONB;
  checked_baseline JSONB;
  additions JSONB;
  specialty_column JSONB;
  already_applied BOOLEAN;
  occupied BOOLEAN;
  not_null_constraints JSONB;
  not_null_entry JSONB;
  phase INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Barber specialty migration: invalid active schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path', format('%I, pg_catalog, pg_temp', schema_name), true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  FOREACH object_name IN ARRAY table_names LOOP
    table_oid := pg_catalog.to_regclass(format('%I.%I', schema_name, object_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class WHERE oid=table_oid AND relkind='r' AND relpersistence<>'t'
    ) THEN
      RAISE EXCEPTION 'Barber specialty migration: missing/incompatible table %.%', schema_name, object_name;
    END IF;
    lock_mode := CASE WHEN object_name='ustara_schema_migrations' THEN 'EXCLUSIVE'
      WHEN object_name IN ('barbers','pending_registrations') THEN 'ACCESS EXCLUSIVE'
      ELSE 'SHARE UPDATE EXCLUSIVE' END;
    EXECUTE format('LOCK TABLE ONLY %I.%I IN %s MODE', schema_name, object_name, lock_mode);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_inherits i
    JOIN pg_catalog.pg_class c ON c.oid=i.inhrelid OR c.oid=i.inhparent
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=schema_name AND c.relname=ANY(table_names)
  ) THEN
    RAISE EXCEPTION 'Barber specialty migration: inherited tables require separate review';
  END IF;
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)', schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count <> cardinality(prerequisites) THEN
    RAISE EXCEPTION 'Barber specialty migration: prerequisite migration markers missing';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)', schema_name)
    INTO already_applied USING version_name;
  BEGIN
    baseline := pg_catalog.obj_description(pg_catalog.to_regclass(
      format('%I.registration_phone_limits', schema_name)), 'pg_class')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Barber specialty migration: malformed baseline';
  END;
  IF already_applied THEN
    IF baseline->>'barber_specialty_migration' IS DISTINCT FROM version_name
       OR jsonb_typeof(baseline->'barber_specialty_previous_baseline') IS DISTINCT FROM 'object'
       OR jsonb_typeof(baseline->'barber_specialty_additions') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Barber specialty migration: recorded baseline metadata missing';
    END IF;
    previous_baseline := baseline->'barber_specialty_previous_baseline';
  ELSE
    IF baseline ? 'barber_specialty_migration' OR baseline ? 'barber_specialty_previous_baseline'
       OR baseline ? 'barber_specialty_additions' THEN
      RAISE EXCEPTION 'Barber specialty migration: untracked baseline metadata';
    END IF;
    previous_baseline := baseline;
  END IF;
  FOREACH checked_baseline IN ARRAY ARRAY[baseline, previous_baseline] LOOP
    IF jsonb_typeof(checked_baseline) IS DISTINCT FROM 'object'
       OR checked_baseline->>'version' IS DISTINCT FROM '20261114_otp_registration'
       OR checked_baseline->>'format' IS DISTINCT FROM '1'
       OR checked_baseline->>'profile_names_migration' IS DISTINCT FROM predecessor
       OR jsonb_typeof(checked_baseline->'profile_names_previous_baseline') IS DISTINCT FROM 'object'
       OR jsonb_typeof(checked_baseline->'tables') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Barber specialty migration: incompatible baseline header/archive';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(checked_baseline->'tables')) <> cardinality(table_names)
       OR NOT (checked_baseline->'tables' ?& table_names) THEN
      RAISE EXCEPTION 'Barber specialty migration: expected ten baseline tables';
    END IF;
    FOREACH object_name IN ARRAY table_names LOOP
      table_signature := checked_baseline->'tables'->object_name;
      IF jsonb_typeof(table_signature) IS DISTINCT FROM 'object'
         OR jsonb_typeof(table_signature->'table') IS DISTINCT FROM 'object'
         OR jsonb_typeof(table_signature->'columns') IS DISTINCT FROM 'array'
         OR jsonb_typeof(table_signature->'constraints') IS DISTINCT FROM 'array'
         OR jsonb_typeof(table_signature->'indexes') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Barber specialty migration: malformed table signature %', object_name;
      END IF;
    END LOOP;
  END LOOP;
  IF previous_baseline ? 'barber_specialty_migration'
     OR previous_baseline ? 'barber_specialty_previous_baseline'
     OR previous_baseline ? 'barber_specialty_additions' THEN
    RAISE EXCEPTION 'Barber specialty migration: incompatible predecessor archive';
  END IF;
  IF already_applied AND
    (baseline - 'tables' - 'barber_specialty_migration' - 'barber_specialty_previous_baseline' - 'barber_specialty_additions')
      IS DISTINCT FROM (previous_baseline - 'tables') THEN
    RAISE EXCEPTION 'Barber specialty migration: predecessor metadata/archive changed';
  END IF;
  -- Verify the preserved profile-name archive still proves the predecessor
  -- transition; accepting an empty object would discard historical drift checks.
  profile_archive := previous_baseline->'profile_names_previous_baseline';
  IF profile_archive->>'version' IS DISTINCT FROM '20261114_otp_registration'
     OR profile_archive->>'format' IS DISTINCT FROM '1'
     OR jsonb_typeof(profile_archive->'tables') IS DISTINCT FROM 'object'
     OR profile_archive ? 'profile_names_migration'
     OR profile_archive ? 'profile_names_previous_baseline' THEN
    RAISE EXCEPTION 'Barber specialty migration: invalid original profile-name archive';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(profile_archive->'tables')) <> cardinality(table_names)
     OR NOT (profile_archive->'tables' ?& table_names) THEN
    RAISE EXCEPTION 'Barber specialty migration: incomplete original profile-name archive';
  END IF;
  profile_manifest := profile_archive->'tables';
  FOREACH object_name IN ARRAY ARRAY['customers','barbers'] LOOP
    IF jsonb_typeof(profile_manifest->object_name->'columns') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Barber specialty migration: invalid original profile columns';
    END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(profile_manifest->object_name->'columns') AS e(item)
        WHERE item->>'name'='name' AND item->>'type'='character varying(50)') <> 1 THEN
      RAISE EXCEPTION 'Barber specialty migration: original legacy name missing in %', object_name;
    END IF;
    -- PostgreSQL 18 catalogs NOT NULL separately (contype='n'). Only this
    -- column's exact definition belongs to the approved delta; retain all others.
    SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb) INTO not_null_constraints
    FROM jsonb_array_elements(profile_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
    WHERE item->>'type'='n' AND item->>'definition'='NOT NULL name';
    IF jsonb_array_length(not_null_constraints)>1 THEN
      RAISE EXCEPTION 'Barber specialty migration archive: duplicate NOT NULL constraint';
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
        RAISE EXCEPTION 'Barber specialty migration archive: incompatible NOT NULL constraint';
      END IF;
    END LOOP;
    IF jsonb_array_length(not_null_constraints)>0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(profile_manifest->object_name->'columns') AS e(item)
      WHERE item->>'name'='name' AND item->'not_null'='true'::jsonb
    ) THEN
      RAISE EXCEPTION 'Barber specialty migration archive: archived NOT NULL disagrees with column';
    END IF;
    profile_manifest := jsonb_set(profile_manifest, ARRAY[object_name,'constraints'],
      (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
       FROM jsonb_array_elements(profile_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
       WHERE item->>'type' IS DISTINCT FROM 'n' OR item->>'definition' IS DISTINCT FROM 'NOT NULL name'));
    profile_manifest := jsonb_set(profile_manifest, ARRAY[object_name,'columns'],
      (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
       FROM jsonb_array_elements(profile_manifest->object_name->'columns') WITH ORDINALITY AS e(item,ordinal)
       WHERE item->>'name'<>'name'));
  END LOOP;
  IF profile_manifest IS DISTINCT FROM previous_baseline->'tables' THEN
    RAISE EXCEPTION 'Barber specialty migration: original archive differs beyond legacy name removals';
  END IF;
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

    IF phase=1 THEN
      IF actual_manifest IS DISTINCT FROM baseline->'tables' THEN
        RAISE EXCEPTION 'Barber specialty migration: schema drift; no changes committed';
      END IF;
      IF NOT already_applied THEN
        FOREACH object_name IN ARRAY ARRAY['barbers','pending_registrations'] LOOP
          IF EXISTS (SELECT 1 FROM jsonb_array_elements(actual_manifest->object_name->'columns') AS e(item)
                     WHERE item->>'name'='specialty')
             OR EXISTS (SELECT 1 FROM jsonb_array_elements(actual_manifest->object_name->'constraints') AS e(item)
                        WHERE item->>'name'=object_name || '_specialty_check') THEN
            RAISE EXCEPTION 'Barber specialty migration: untracked specialty objects in %', object_name;
          END IF;
        END LOOP;
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.barbers) OR EXISTS(SELECT 1 FROM %I.pending_registrations WHERE role=%L)',
          schema_name, schema_name, 'barber') INTO occupied;
        IF occupied THEN
          RAISE EXCEPTION 'Barber specialty migration: existing barber profiles/pending registrations need separately approved cleanup; no backfill performed';
        END IF;
        EXECUTE format('ALTER TABLE %I.barbers ADD COLUMN specialty VARCHAR(20) NOT NULL,
          ADD CONSTRAINT barbers_specialty_check CHECK (specialty IN (%L,%L,%L))',
          schema_name, 'barber', 'cosmetolog', 'stylist');
        EXECUTE format('ALTER TABLE %I.pending_registrations ADD COLUMN specialty VARCHAR(20),
          ADD CONSTRAINT pending_registrations_specialty_check CHECK (
            (role=%L AND specialty IS NULL) OR
            (role=%L AND specialty IS NOT NULL AND specialty IN (%L,%L,%L)))',
          schema_name, 'customer', 'barber', 'barber', 'cosmetolog', 'stylist');
        CONTINUE;
      END IF;
    END IF;
    -- Strip ONLY the two approved columns, CHECKs and associated NOT NULL, retaining every other
    -- table/column/constraint/index attribute and ordering for comparison.
    reduced_manifest := actual_manifest;
    additions := '{}'::jsonb;
    FOREACH object_name IN ARRAY ARRAY['barbers','pending_registrations'] LOOP
      constraint_name := object_name || '_specialty_check';
      IF (SELECT count(*) FROM jsonb_array_elements(actual_manifest->object_name->'columns') AS e(item)
          WHERE item->>'name'='specialty') <> 1
         OR (SELECT count(*) FROM jsonb_array_elements(actual_manifest->object_name->'constraints') AS e(item)
             WHERE item->>'name'=constraint_name AND item->>'type'='c'
               AND item->'validated'='true'::jsonb) <> 1 THEN
        RAISE EXCEPTION 'Barber specialty migration: expected column/CHECK missing in %', object_name;
      END IF;
      SELECT item INTO specialty_column FROM jsonb_array_elements(actual_manifest->object_name->'columns') AS e(item)
        WHERE item->>'name'='specialty';
      IF specialty_column->>'type' IS DISTINCT FROM 'character varying(20)'
         OR specialty_column->'not_null' IS DISTINCT FROM to_jsonb(object_name='barbers')
         OR specialty_column->>'identity' IS DISTINCT FROM ''
         OR specialty_column->>'generated' IS DISTINCT FROM ''
         OR specialty_column->'default' IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'Barber specialty migration: incompatible specialty column in %', object_name;
      END IF;
      -- PostgreSQL 18 catalogs NOT NULL separately (contype='n'). Only this
      -- column's exact definition belongs to the approved delta; retain all others.
      SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb) INTO not_null_constraints
      FROM jsonb_array_elements(actual_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
      WHERE item->>'type'='n' AND item->>'definition'='NOT NULL specialty';
      IF jsonb_array_length(not_null_constraints)>1 THEN
        RAISE EXCEPTION 'Barber specialty migration: duplicate NOT NULL constraint';
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
          RAISE EXCEPTION 'Barber specialty migration: incompatible NOT NULL constraint';
        END IF;
      END LOOP;
      IF jsonb_array_length(not_null_constraints) IS DISTINCT FROM (
        SELECT count(*)::integer FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid
          AND c.conkey=ARRAY[a.attnum]::SMALLINT[]
        WHERE c.conrelid=pg_catalog.to_regclass(format('%I.%I',schema_name,object_name))
          AND c.contype='n' AND a.attname='specialty' AND NOT a.attisdropped
      ) THEN
        RAISE EXCEPTION 'Barber specialty migration: unexpected NOT NULL catalog definition';
      END IF;
      additions := additions || jsonb_build_object(object_name, jsonb_build_object('column', specialty_column,
        'constraint', (SELECT item FROM jsonb_array_elements(actual_manifest->object_name->'constraints') AS e(item)
                       WHERE item->>'name'=constraint_name)));
      IF jsonb_array_length(not_null_constraints)>0 THEN
        additions := jsonb_set(additions, ARRAY[object_name,'not_null_constraints'], not_null_constraints);
      END IF;
      reduced_manifest := jsonb_set(reduced_manifest, ARRAY[object_name,'columns'],
        (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
         FROM jsonb_array_elements(actual_manifest->object_name->'columns') WITH ORDINALITY AS e(item,ordinal)
         WHERE item->>'name'<>'specialty'));
      reduced_manifest := jsonb_set(reduced_manifest, ARRAY[object_name,'constraints'],
        (SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb)
         FROM jsonb_array_elements(actual_manifest->object_name->'constraints') WITH ORDINALITY AS e(item,ordinal)
         WHERE item->>'name'<>constraint_name
           AND (item->>'type' IS DISTINCT FROM 'n' OR item->>'definition' IS DISTINCT FROM 'NOT NULL specialty')));
    END LOOP;
    IF reduced_manifest IS DISTINCT FROM previous_baseline->'tables' THEN
      RAISE EXCEPTION 'Barber specialty migration: changes beyond approved specialty additions';
    END IF;
    IF already_applied THEN
      IF additions IS DISTINCT FROM baseline->'barber_specialty_additions' THEN
        RAISE EXCEPTION 'Barber specialty migration: recorded specialty definitions changed';
      END IF;
      RETURN;
    END IF;
  END LOOP;
  EXECUTE format('COMMENT ON TABLE %I.registration_phone_limits IS %L', schema_name,
    (baseline || jsonb_build_object('tables', actual_manifest,
      'barber_specialty_migration', version_name,
      'barber_specialty_previous_baseline', previous_baseline,
      'barber_specialty_additions', additions))::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)', schema_name) USING version_name;
END $$;
COMMIT;
