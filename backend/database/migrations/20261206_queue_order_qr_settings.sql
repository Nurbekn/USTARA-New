-- v23: Staff FIFO override audit and Admin-controlled expiry for newly generated QR tokens.
-- Existing walk-ins retain original FIFO until a barber explicitly reorders them.
-- Existing QR tokens retain their original expires_at timestamp.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for queue order/QR settings';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261205_walkin_qr_approval') THEN
  RAISE EXCEPTION 'Requires QR approval migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261206_queue_order_qr_settings')
    OR pg_catalog.to_regclass('walkin_queue_reorder_events') IS NOT NULL
    OR pg_catalog.to_regclass('walkin_qr_settings') IS NOT NULL
    OR pg_catalog.to_regclass('walkin_qr_settings_events') IS NOT NULL THEN
  RAISE EXCEPTION 'Queue order/QR settings migration already applied or untracked';
 END IF;
 ALTER TABLE walkin_queue ADD COLUMN queue_position INTEGER;
 CREATE INDEX walkin_queue_manual_position ON walkin_queue(barber_id,queue_date,queue_position,id)
    WHERE status='waiting';
 CREATE TABLE walkin_queue_reorder_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  entry_id BIGINT NOT NULL REFERENCES walkin_queue(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  old_position INTEGER NOT NULL CHECK (old_position>0),
  new_position INTEGER NOT NULL CHECK (new_position>0),
  reason VARCHAR(200) NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX walkin_queue_reorder_audit ON walkin_queue_reorder_events(barber_id,id DESC);
 CREATE TABLE walkin_qr_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
  ttl_minutes INTEGER NOT NULL DEFAULT 10 CHECK (ttl_minutes BETWEEN 1 AND 120),
  changed_by_user_id INTEGER REFERENCES admin_accounts(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 INSERT INTO walkin_qr_settings(id,ttl_minutes) VALUES(1,10);
 CREATE TABLE walkin_qr_settings_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id INTEGER NOT NULL REFERENCES admin_accounts(id),
  old_minutes INTEGER NOT NULL CHECK(old_minutes BETWEEN 1 AND 120),
  new_minutes INTEGER NOT NULL CHECK(new_minutes BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261206_queue_order_qr_settings');
END $$;
COMMIT;
