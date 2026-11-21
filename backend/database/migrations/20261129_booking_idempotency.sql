-- Forward-only: store an idempotent client booking attempt atomically with its booking.
-- Existing bookings are preserved; production database changes require operator approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
   RAISE EXCEPTION 'Invalid schema';
 END IF;
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:'||schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261128_device_sessions') THEN
   RAISE EXCEPTION 'Device sessions migration required';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261129_booking_idempotency') THEN
   RAISE EXCEPTION 'Already applied; inspect schema';
 END IF;
 CREATE TABLE booking_request_keys (
   customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
   request_id UUID NOT NULL,
   fingerprint CHAR(64) NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
   booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   PRIMARY KEY(customer_id,request_id)
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261129_booking_idempotency');
END $$;
COMMIT;
