-- v172 #119/#120: ONE ADDRESS per independent barber shop profile.
-- No memberships, shared calendars, tenant permissions, billing, or automatic booking redirects.
-- Only apply after backup and operator approval. Does not modify existing bookings.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe shop schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261225_barber_self_reported_certificates') THEN
  RAISE EXCEPTION 'Shops require previous certificates migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261226_single_address_barber_shops')
  OR pg_catalog.to_regclass('barber_owned_shops') IS NOT NULL THEN
  RAISE EXCEPTION 'Shop migration already recorded or partially applied';
 END IF;
 CREATE TABLE barber_owned_shops (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_barber_id INTEGER NOT NULL UNIQUE REFERENCES barbers(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 120),
  address VARCHAR(240) NOT NULL CHECK(length(btrim(address)) BETWEEN 5 AND 240),
  description VARCHAR(1200) NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT FALSE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261226_single_address_barber_shops');
END $$;
COMMIT;
