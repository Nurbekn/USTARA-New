-- Decision 17: booking cancellation deadline snapshots, no fees/online payments.
-- Forward-only, administrator should review backup and migrate before backend deploy.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Unsafe schema for cancellation policy';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261130_customer_time_overlap') THEN
    RAISE EXCEPTION 'Cancellation policy requires customer overlap migration';
  END IF;
  IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261201_cancellation_policy') THEN
    RAISE EXCEPTION 'Cancellation policy already applied; inspect schema';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE
    (attrelid='barbers'::regclass AND attname IN ('cancellation_cutoff_minutes','cancellation_policy_text')
      OR attrelid='bookings'::regclass AND attname IN ('cancellation_cutoff_minutes','cancellation_policy_text'))
     AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Untracked cancellation terms columns present; review';
  END IF;
  ALTER TABLE barbers ADD COLUMN cancellation_cutoff_minutes INTEGER
    CONSTRAINT barber_cancellation_cutoff_check CHECK (cancellation_cutoff_minutes BETWEEN 0 AND 10080);
  ALTER TABLE barbers ADD COLUMN cancellation_policy_text VARCHAR(280);
  ALTER TABLE bookings ADD COLUMN cancellation_cutoff_minutes INTEGER
    CONSTRAINT booking_cancellation_cutoff_check CHECK (cancellation_cutoff_minutes BETWEEN 0 AND 10080);
  ALTER TABLE bookings ADD COLUMN cancellation_policy_text VARCHAR(280);
  
  -- Every booking entry point, including manual inserts, receives a server-side snapshot.
  -- Barber rule changes cannot retroactively change existing booking terms.
  EXECUTE $ddl$
    CREATE FUNCTION ustara_snapshot_cancellation_terms() RETURNS trigger
    LANGUAGE plpgsql SET search_path FROM CURRENT AS $cancellation$
    BEGIN
      SELECT b.cancellation_cutoff_minutes,b.cancellation_policy_text
        INTO NEW.cancellation_cutoff_minutes, NEW.cancellation_policy_text
        FROM barbers b WHERE b.id=NEW.barber_id FOR SHARE;
      RETURN NEW;
    END $cancellation$
  $ddl$;
  EXECUTE $ddl$
    CREATE TRIGGER bookings_cancellation_terms_on_insert
    BEFORE INSERT ON bookings
    FOR EACH ROW EXECUTE FUNCTION ustara_snapshot_cancellation_terms()
  $ddl$;
  INSERT INTO ustara_schema_migrations(version) VALUES('20261201_cancellation_policy');
END $$;
COMMIT;
