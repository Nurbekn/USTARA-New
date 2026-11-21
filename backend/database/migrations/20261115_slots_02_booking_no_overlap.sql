-- Enforce active booking overlap prevention in PostgreSQL.
-- btree_gist must be installed by an administrator before this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261115_slots_02_booking_no_overlap';
  prerequisite CONSTANT TEXT := '20261114_slots_01_booking_duration';
  tracking_oid OID;
  bookings_oid OID;
  marker_count INTEGER;
  already_applied BOOLEAN;
  opclass_oid OID;
  overlap_ids TEXT;
  constraint_oid OID;
  expected_constraint_oid OID;
  expected_table_oid OID;
  actual_constraint_definition TEXT;
  expected_constraint_definition TEXT;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Booking overlap migration: invalid active schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));

  tracking_oid := pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name));
  bookings_oid := pg_catalog.to_regclass(format('%I.bookings',schema_name));
  IF tracking_oid IS NULL OR bookings_oid IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_class WHERE oid=ANY(ARRAY[tracking_oid,bookings_oid])
         AND relkind='r' AND relpersistence<>'t') <> 2 THEN
    RAISE EXCEPTION 'Booking overlap migration: ordinary tracking and bookings tables required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=$1',schema_name)
    INTO marker_count USING prerequisite;
  IF marker_count<>1 THEN
    RAISE EXCEPTION 'Booking overlap migration: prerequisite marker % is missing',prerequisite;
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO already_applied USING version_name;

  SELECT opc.oid INTO opclass_oid
  FROM pg_catalog.pg_opclass opc
  JOIN pg_catalog.pg_namespace n ON n.oid=opc.opcnamespace
  JOIN pg_catalog.pg_am am ON am.oid=opc.opcmethod
  WHERE n.nspname='public' AND opc.opcname='gist_int4_ops'
    AND am.amname='gist' AND opc.opcintype='integer'::regtype;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='btree_gist' AND n.nspname='public'
  ) OR opclass_oid IS NULL THEN
    RAISE EXCEPTION 'Booking overlap migration: public btree_gist extension and public.gist_int4_ops are required; ask an administrator to install btree_gist in public';
  END IF;

  EXECUTE format('LOCK TABLE ONLY %I.bookings IN ACCESS EXCLUSIVE MODE',schema_name);
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=bookings_oid OR inhparent=bookings_oid) THEN
    RAISE EXCEPTION 'Booking overlap migration: inherited bookings table requires separate review';
  END IF;
  IF already_applied THEN
    SELECT c.oid INTO constraint_oid FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=bookings_oid AND c.conname='bookings_active_time_excl'
      AND c.contype='x' AND c.convalidated;
    IF constraint_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      JOIN pg_catalog.pg_class index_relation ON index_relation.oid=i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid=index_relation.relam
      WHERE c.oid=constraint_oid AND i.indisvalid AND i.indisready AND i.indislive
        AND am.amname='gist'
        AND EXISTS (SELECT 1 FROM unnest(i.indclass) AS opclass(oid) WHERE opclass.oid=opclass_oid)
    ) THEN
      RAISE EXCEPTION 'Booking overlap migration: recorded exclusion constraint is missing or invalid';
    END IF;
    -- Compare PostgreSQL's canonical catalog deparse against a reference
    -- constraint parsed from the intended DDL and the live column types. This
    -- checks operators, expression, bounds, predicate and opclasses without
    -- relying on hand-written text patterns. The temporary table is dropped
    -- automatically at transaction end and contains no booking data.
    EXECUTE format('CREATE TEMP TABLE %I ON COMMIT DROP AS
      SELECT barber_id, booking_time, duration_minutes, status FROM %I.bookings WITH NO DATA',
      'ustara_booking_overlap_expected',schema_name);
    EXECUTE $ddl$
      ALTER TABLE pg_temp.ustara_booking_overlap_expected
      ADD CONSTRAINT bookings_active_time_excl
      EXCLUDE USING gist (
        barber_id public.gist_int4_ops WITH =,
        (tsrange(booking_time AT TIME ZONE 'UTC',
          (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
      ) WHERE (status IN ('pending','confirmed'))
    $ddl$;
    expected_table_oid := pg_catalog.to_regclass('pg_temp.ustara_booking_overlap_expected');
    SELECT c.oid, pg_catalog.pg_get_constraintdef(c.oid,false)
      INTO expected_constraint_oid,expected_constraint_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=expected_table_oid AND c.conname='bookings_active_time_excl' AND c.contype='x';
    SELECT pg_catalog.pg_get_constraintdef(c.oid,false)
      INTO actual_constraint_definition
    FROM pg_catalog.pg_constraint c WHERE c.oid=constraint_oid;
    IF expected_constraint_oid IS NULL OR actual_constraint_definition IS DISTINCT FROM expected_constraint_definition THEN
      RAISE EXCEPTION 'Booking overlap migration: recorded constraint definition differs from the required active booking exclusion rule';
    END IF;
    RETURN;
  END IF;
  EXECUTE format($sql$
    SELECT string_agg(format('%%s/%%s', a.id, b.id), ', ' ORDER BY a.id, b.id)
    FROM %I.bookings a JOIN %I.bookings b ON a.id < b.id AND a.barber_id=b.barber_id
    WHERE a.status IN ('pending','confirmed') AND b.status IN ('pending','confirmed')
      AND tsrange(a.booking_time AT TIME ZONE 'UTC',
            (a.booking_time AT TIME ZONE 'UTC')+a.duration_minutes*interval '1 minute','[)')
          && tsrange(b.booking_time AT TIME ZONE 'UTC',
            (b.booking_time AT TIME ZONE 'UTC')+b.duration_minutes*interval '1 minute','[)')
  $sql$,schema_name,schema_name) INTO overlap_ids;
  IF overlap_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Booking overlap migration: active overlapping booking ID pairs: %',overlap_ids;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=bookings_oid AND conname='bookings_active_time_excl') THEN
    RAISE EXCEPTION 'Booking overlap migration: untracked constraint bookings_active_time_excl already exists';
  END IF;
  EXECUTE format($sql$
    ALTER TABLE %I.bookings ADD CONSTRAINT bookings_active_time_excl
    EXCLUDE USING gist (
      barber_id public.gist_int4_ops WITH =,
      (tsrange(booking_time AT TIME ZONE 'UTC',
        (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
    ) WHERE (status IN ('pending','confirmed'))
  $sql$,schema_name);

  SELECT oid INTO constraint_oid FROM pg_catalog.pg_constraint
  WHERE conrelid=bookings_oid AND conname='bookings_active_time_excl' AND contype='x' AND convalidated;
  IF constraint_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid=(SELECT conindid FROM pg_catalog.pg_constraint WHERE oid=constraint_oid)
      AND i.indisvalid AND i.indisready AND i.indislive
  ) THEN
    RAISE EXCEPTION 'Booking overlap migration: exclusion constraint is missing or invalid';
  END IF;
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
