-- Snapshot booking duration and add rejected without renaming confirmed.
-- Apply before deploying the new booking writers. No automatic execution.
-- Standalone maintenance window; stop/drain other DDL and use the common schema
-- advisory lock. Fixed locks: tracking EXCLUSIVE, services SHARE (freezes service
-- updates/deletes during backfill), bookings ACCESS EXCLUSIVE. Not zero downtime.
-- Errors roll back DDL, backfill, comment and marker together. No down migration:
-- removing duration snapshots / rejected would discard data or change meaning.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_slots_01_booking_duration';
  prerequisite_versions CONSTANT TEXT[] := ARRAY['20261113_00_users_foundation','20261113_unified_accounts'];
  tracking_oid OID;
  table_oid OID;
  service_oid OID;
  status_att SMALLINT;
  marker_count INTEGER;
  already_applied BOOLEAN;
  invalid_data BOOLEAN;
  table_signature JSONB;
  previous_signature JSONB;
  reduced_signature JSONB;
  old_status JSONB;
  baseline JSONB;
  previous_comment TEXT;
  not_null_constraints JSONB;
  not_null_entry JSONB;
  phase INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Booking migration: invalid active schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  tracking_oid := pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name));
  table_oid := pg_catalog.to_regclass(format('%I.bookings',schema_name));
  service_oid := pg_catalog.to_regclass(format('%I.services',schema_name));
  IF tracking_oid IS NULL OR table_oid IS NULL OR service_oid IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_class WHERE oid=ANY(ARRAY[tracking_oid,table_oid,service_oid])
         AND relkind='r' AND relpersistence<>'t') <> 3 THEN
    RAISE EXCEPTION 'Booking migration: ordinary tracking/services/bookings tables required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('LOCK TABLE ONLY %I.services IN SHARE MODE',schema_name);
  EXECUTE format('LOCK TABLE ONLY %I.bookings IN ACCESS EXCLUSIVE MODE',schema_name);
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=ANY(ARRAY[table_oid,service_oid]) OR inhparent=ANY(ARRAY[table_oid,service_oid])) THEN
    RAISE EXCEPTION 'Booking migration: inherited/partitioned relationships require review';
  END IF;
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisite_versions;
  IF marker_count <> cardinality(prerequisite_versions) THEN RAISE EXCEPTION 'Booking migration: prerequisites missing'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO already_applied USING version_name;
  previous_comment := pg_catalog.obj_description(table_oid,'pg_class');
  IF already_applied THEN
    BEGIN baseline := previous_comment::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Booking migration: malformed baseline'; END;
    IF baseline->>'version' IS DISTINCT FROM version_name OR baseline->>'format' IS DISTINCT FROM '1'
       OR jsonb_typeof(baseline->'previous_signature') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Booking migration: recorded baseline missing/incompatible';
    END IF;
    previous_signature := baseline->'previous_signature';
  END IF;
  FOR phase IN 1..2 LOOP
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
    IF phase=1 THEN
      IF already_applied THEN
        IF table_signature IS DISTINCT FROM baseline->'signature' THEN RAISE EXCEPTION 'Booking migration: schema drift; no repair'; END IF;
      ELSE
        previous_signature := table_signature;
        IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=table_oid AND attname='duration_minutes' AND NOT attisdropped)
           OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=table_oid AND conname='bookings_duration_minutes_check') THEN
          RAISE EXCEPTION 'Booking migration: untracked duration objects';
        END IF;
      END IF;
      IF jsonb_typeof(previous_signature->'columns') IS DISTINCT FROM 'array'
         OR jsonb_typeof(previous_signature->'constraints') IS DISTINCT FROM 'array'
         OR jsonb_typeof(previous_signature->'indexes') IS DISTINCT FROM 'array'
         OR jsonb_typeof(previous_signature->'table') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Booking migration: malformed predecessor signature';
      END IF;
      SELECT item INTO old_status FROM jsonb_array_elements(previous_signature->'constraints') AS e(item)
        WHERE item->>'name'='bookings_status_check' AND item->>'type'='c' AND item->'validated'='true'::jsonb;
      IF old_status IS NULL THEN RAISE EXCEPTION 'Booking migration: expected original status CHECK missing'; END IF;
      IF NOT already_applied THEN
        SELECT attnum INTO status_att FROM pg_catalog.pg_attribute WHERE attrelid=table_oid AND attname='status' AND NOT attisdropped;
        IF status_att IS NULL OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=table_oid AND contype='c' AND status_att=ANY(conkey))<>1
           OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=table_oid AND conname='bookings_status_check'
                         AND conkey=ARRAY[status_att]::SMALLINT[]) THEN
          RAISE EXCEPTION 'Booking migration: unexpected status constraints require review';
        END IF;
        IF (SELECT array_agg(parts[1] ORDER BY parts[1]) FROM regexp_matches(old_status->>'definition', $regex$'([^']+)'$regex$, 'g') AS captured(parts))
           IS DISTINCT FROM ARRAY['cancelled','completed','confirmed','pending']::TEXT[] THEN
          RAISE EXCEPTION 'Booking migration: expected original four-status CHECK required';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=service_oid AND attname='duration_minutes'
                      AND NOT attisdropped AND atttypid='integer'::regtype AND attnotnull) THEN
          RAISE EXCEPTION 'Booking migration: service duration must be a non-null INTEGER';
        END IF;
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.bookings b LEFT JOIN %I.services s ON s.id=b.service_id
          WHERE s.id IS NULL OR s.duration_minutes IS NULL OR s.duration_minutes<=0 OR s.barber_id IS DISTINCT FROM b.barber_id
             OR b.status IS NULL OR b.status NOT IN (%L,%L,%L,%L))',schema_name,schema_name,
          'pending','confirmed','completed','cancelled') INTO invalid_data;
        IF invalid_data THEN RAISE EXCEPTION 'Booking migration: missing/mismatched service, invalid duration or status; no guessed backfill'; END IF;
        EXECUTE format('ALTER TABLE %I.bookings ADD COLUMN duration_minutes INTEGER',schema_name);
        EXECUTE format('UPDATE %I.bookings b SET duration_minutes=s.duration_minutes FROM %I.services s WHERE s.id=b.service_id',schema_name,schema_name);
        EXECUTE format('ALTER TABLE %I.bookings ALTER COLUMN duration_minutes SET NOT NULL,
          ADD CONSTRAINT bookings_duration_minutes_check CHECK (duration_minutes>0),
          DROP CONSTRAINT bookings_status_check,
          ADD CONSTRAINT bookings_status_check CHECK (status IN (%L,%L,%L,%L,%L))',schema_name,
          'pending','confirmed','completed','cancelled','rejected');
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.bookings a JOIN %I.bookings b
          ON a.barber_id=b.barber_id AND a.id<b.id
          WHERE a.status IN (%L,%L) AND b.status IN (%L,%L)
            AND a.booking_time < b.booking_time + b.duration_minutes * interval %L
            AND b.booking_time < a.booking_time + a.duration_minutes * interval %L)',
          schema_name,schema_name,'pending','confirmed','pending','confirmed','1 minute','1 minute') INTO invalid_data;
        IF invalid_data THEN RAISE EXCEPTION 'Booking migration: existing active overlaps require review; no changes committed'; END IF;
        CONTINUE;
      END IF;
    END IF;
    -- Prove the only schema changes were duration (including its NOT NULL)
    -- and the expanded status CHECK. Preserve every other column, FK, index and table attribute.
    IF (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid=table_oid AND attname='duration_minutes' AND NOT attisdropped
          AND atttypid='integer'::regtype AND attnotnull AND NOT atthasdef AND attidentity='' AND attgenerated='')<>1
       OR (SELECT count(*) FROM pg_catalog.pg_constraint WHERE conrelid=table_oid AND conname='bookings_duration_minutes_check'
            AND contype='c' AND convalidated)<>1 THEN
      RAISE EXCEPTION 'Booking migration: incompatible duration column/CHECK';
    END IF;
    -- PostgreSQL 18 catalogs NOT NULL separately (contype='n'). Only this
    -- column's exact definition belongs to the approved delta; retain all others.
    SELECT coalesce(jsonb_agg(item ORDER BY ordinal), '[]'::jsonb) INTO not_null_constraints
    FROM jsonb_array_elements(table_signature->'constraints') WITH ORDINALITY AS e(item,ordinal)
    WHERE item->>'type'='n' AND item->>'definition'='NOT NULL duration_minutes';
    IF jsonb_array_length(not_null_constraints)>1 THEN
      RAISE EXCEPTION 'Booking migration: duplicate NOT NULL constraint';
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
        RAISE EXCEPTION 'Booking migration: incompatible NOT NULL constraint';
      END IF;
    END LOOP;
    IF jsonb_array_length(not_null_constraints) IS DISTINCT FROM (
      SELECT count(*)::integer FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.conrelid
        AND c.conkey=ARRAY[a.attnum]::SMALLINT[]
      WHERE c.conrelid=pg_catalog.to_regclass(format('%I.%I',schema_name,'bookings'))
        AND c.contype='n' AND a.attname='duration_minutes' AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Booking migration: unexpected NOT NULL catalog definition';
    END IF;
    reduced_signature := jsonb_set(table_signature, '{columns}',
      (SELECT coalesce(jsonb_agg(item ORDER BY ordinal),'[]'::jsonb)
       FROM jsonb_array_elements(table_signature->'columns') WITH ORDINALITY AS e(item,ordinal) WHERE item->>'name'<>'duration_minutes'));
    reduced_signature := jsonb_set(reduced_signature, '{constraints}',
      (SELECT coalesce(jsonb_agg(CASE WHEN item->>'name'='bookings_status_check' THEN old_status ELSE item END ORDER BY ordinal),'[]'::jsonb)
       FROM jsonb_array_elements(table_signature->'constraints') WITH ORDINALITY AS e(item,ordinal)
       WHERE item->>'name'<>'bookings_duration_minutes_check'
         AND (item->>'type' IS DISTINCT FROM 'n' OR item->>'definition' IS DISTINCT FROM 'NOT NULL duration_minutes')));
    IF reduced_signature IS DISTINCT FROM previous_signature THEN RAISE EXCEPTION 'Booking migration: changes beyond approved duration/status delta'; END IF;
    IF already_applied THEN RETURN; END IF;
  END LOOP;
  EXECUTE format('COMMENT ON TABLE %I.bookings IS %L',schema_name,
    jsonb_build_object('version',version_name,'format','1','signature',table_signature,
      'previous_signature',previous_signature,'previous_comment',previous_comment)::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
