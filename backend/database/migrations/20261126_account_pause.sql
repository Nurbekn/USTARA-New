-- Decision #135. Forward-only; an existing account remains active by default.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for account pause';
  END IF;
  PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261125_multi_service_bookings') THEN
    RAISE EXCEPTION 'Account pause requires multi-service booking migration';
  END IF;
  IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261126_account_pause') THEN
    RAISE EXCEPTION 'Account pause migration already applied; inspect schema';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='users'::regclass
    AND attname='deactivated_at' AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unexpected deactivated_at column; review manually';
  END IF;
  ALTER TABLE users ADD COLUMN deactivated_at TIMESTAMPTZ;
  INSERT INTO ustara_schema_migrations(version) VALUES('20261126_account_pause');
END $$;
COMMIT;
