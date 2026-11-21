-- Decision #169: one customer may book many times, but never overlapping
-- active appointments, even when separate code paths / barber processes write.
-- Forward only. Existing rows are never silently deleted or modified.
-- Review all existing active overlaps and take a backup before approving use.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261130_customer_time_overlap';
  predecessor CONSTANT TEXT := '20261129_booking_idempotency';
  bookings_oid OID;
  expected_oid OID;
  stored_definition TEXT;
  intended_definition TEXT;
  collision RECORD;
  marker_exists BOOLEAN;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Customer overlap migration: unsafe schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path', format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  IF pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Customer overlap migration: version registry missing';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO marker_exists USING predecessor;
  IF NOT marker_exists THEN
    RAISE EXCEPTION 'Customer overlap migration: missing prerequisite %',predecessor;
  END IF;
  bookings_oid := pg_catalog.to_regclass(format('%I.bookings',schema_name));
  IF bookings_oid IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class WHERE oid=bookings_oid AND relkind='r' AND relpersistence<>'t'
  ) THEN
    RAISE EXCEPTION 'Customer overlap migration: ordinary bookings table required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
    WHERE e.extname='btree_gist' AND n.nspname='public'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_opclass opc JOIN pg_catalog.pg_namespace n ON n.oid=opc.opcnamespace
    JOIN pg_catalog.pg_am am ON am.oid=opc.opcmethod
    WHERE n.nspname='public' AND opc.opcname='gist_int4_ops' AND am.amname='gist'
      AND opc.opcintype='integer'::pg_catalog.regtype
  ) THEN
    RAISE EXCEPTION 'Customer overlap migration: btree_gist in public is required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.bookings IN ACCESS EXCLUSIVE MODE',schema_name);
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=bookings_oid OR inhparent=bookings_oid) THEN
    RAISE EXCEPTION 'Customer overlap migration: partitioned/inherited bookings require review';
  END IF;
  -- Generate a canonical definition with PostgreSQL itself, avoiding hand-written
  -- comparisons of catalog SQL that change with server version.
  EXECUTE format('CREATE TEMP TABLE ustara_customer_overlap_expected ON COMMIT DROP AS
    SELECT customer_id,booking_time,duration_minutes,status FROM %I.bookings WITH NO DATA',schema_name);
  EXECUTE $ddl$
    ALTER TABLE pg_temp.ustara_customer_overlap_expected
    ADD CONSTRAINT bookings_customer_time_excl
    EXCLUDE USING gist (
      customer_id public.gist_int4_ops WITH =,
      (tsrange(booking_time AT TIME ZONE 'UTC',
        (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
    ) WHERE (status IN ('pending','confirmed'))
  $ddl$;
  expected_oid := pg_catalog.to_regclass('pg_temp.ustara_customer_overlap_expected');
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false) INTO intended_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=expected_oid AND c.conname='bookings_customer_time_excl' AND c.contype='x';
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false) INTO stored_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=bookings_oid AND c.conname='bookings_customer_time_excl' AND c.contype='x'
      AND c.convalidated;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO marker_exists USING version_name;
  IF marker_exists THEN
    IF intended_definition IS NULL OR stored_definition IS DISTINCT FROM intended_definition OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=bookings_oid AND c.conname='bookings_customer_time_excl' AND c.contype='x'
        AND i.indisvalid AND i.indisready AND i.indislive
    ) THEN
      RAISE EXCEPTION 'Customer overlap migration: recorded constraint absent or altered';
    END IF;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid=bookings_oid AND conname='bookings_customer_time_excl') THEN
    RAISE EXCEPTION 'Customer overlap migration: untracked constraint already exists';
  END IF;
  EXECUTE format($sql$
    SELECT a.id AS first_id,b.id AS second_id
    FROM %I.bookings a JOIN %I.bookings b ON a.customer_id=b.customer_id AND a.id<b.id
    WHERE a.status IN ('pending','confirmed') AND b.status IN ('pending','confirmed')
      AND tsrange(a.booking_time AT TIME ZONE 'UTC',
            (a.booking_time AT TIME ZONE 'UTC')+a.duration_minutes*interval '1 minute','[)')
       && tsrange(b.booking_time AT TIME ZONE 'UTC',
            (b.booking_time AT TIME ZONE 'UTC')+b.duration_minutes*interval '1 minute','[)')
    LIMIT 1
  $sql$,schema_name,schema_name) INTO collision;
  IF collision.first_id IS NOT NULL THEN
    RAISE EXCEPTION 'Customer overlap migration: existing active bookings overlap (IDs %, %); investigate before retry',
      collision.first_id,collision.second_id;
  END IF;
  EXECUTE format($sql$
    ALTER TABLE %I.bookings ADD CONSTRAINT bookings_customer_time_excl
    EXCLUDE USING gist (
      customer_id public.gist_int4_ops WITH =,
      (tsrange(booking_time AT TIME ZONE 'UTC',
        (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
    ) WHERE (status IN ('pending','confirmed'))
  $sql$,schema_name);
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false) INTO stored_definition
    FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
    WHERE c.conrelid=bookings_oid AND c.conname='bookings_customer_time_excl'
      AND c.contype='x' AND c.convalidated AND i.indisvalid AND i.indisready AND i.indislive;
  IF intended_definition IS NULL OR stored_definition IS DISTINCT FROM intended_definition THEN
    RAISE EXCEPTION 'Customer overlap migration: constraint not installed correctly';
  END IF;
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name)
    USING version_name;
END $$;
COMMIT;
