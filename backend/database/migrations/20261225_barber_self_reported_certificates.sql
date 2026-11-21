-- v171 #109: barber self-reported certificate claims, NOT admin verified badges.
-- Apply only after backup and explicit approval; do not auto-run.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe barber certificates schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261224_booking_customer_checkins') THEN
  RAISE EXCEPTION 'Certificates require booking check-in predecessor';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261225_barber_self_reported_certificates')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('barbers') AND attname='certificates' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Certificates migration already present or partially applied';
 END IF;
 ALTER TABLE barbers ADD COLUMN certificates JSONB NOT NULL DEFAULT '[]'::jsonb;
 ALTER TABLE barbers ADD CONSTRAINT barbers_certificates_array_v171 CHECK (
   jsonb_typeof(certificates)='array' AND jsonb_array_length(certificates)<=5
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261225_barber_self_reported_certificates');
END $$;
COMMIT;
