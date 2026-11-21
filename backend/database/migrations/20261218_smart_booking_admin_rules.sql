-- v159 / decision #24: admin pause/resume NEW Smart Booking invitations.
-- Never revoke an existing offer or an existing confirmed booking.
-- Deploy application only after this forward migration has been applied.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for Smart Booking admin rules';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261217_profile_issue_reports')
    OR NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261208_smart_booking_offers') THEN
  RAISE EXCEPTION 'Smart Booking admin settings require earlier migration ledger';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261218_smart_booking_admin_rules')
    OR pg_catalog.to_regclass('smart_booking_admin_settings') IS NOT NULL
    OR pg_catalog.to_regclass('smart_booking_admin_settings_events') IS NOT NULL THEN
  RAISE EXCEPTION 'Smart Booking admin settings already applied or untracked';
 END IF;
 CREATE TABLE smart_booking_admin_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  changed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE TABLE smart_booking_admin_settings_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  previous_enabled BOOLEAN NOT NULL,
  next_enabled BOOLEAN NOT NULL,
  previous_revision BIGINT NOT NULL CHECK(previous_revision>0),
  next_revision BIGINT NOT NULL CHECK(next_revision=previous_revision+1),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT smart_booking_settings_actual_change CHECK(previous_enabled<>next_enabled)
 );
 INSERT INTO smart_booking_admin_settings(id,enabled,revision) VALUES(1,TRUE,1);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261218_smart_booking_admin_rules');
END $$;
COMMIT;
