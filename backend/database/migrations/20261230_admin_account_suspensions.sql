-- v187: Admin suspension is separate from customer-requested deactivation and deletion.
-- No booking or notification rows are modified. Apply to disposable PostgreSQL first.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for admin account suspension';
  END IF;
  PERFORM pg_catalog.set_config('search_path', format('%I,pg_catalog,pg_temp',schema_name), true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261229_barber_phone_booking_invites') THEN
    RAISE EXCEPTION 'Admin suspension requires the previous phone booking migration';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261230_admin_account_suspensions') THEN
    RAISE EXCEPTION 'Admin suspension migration already applied';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='users'::regclass
    AND attname='admin_suspended_at' AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unexpected admin_suspended_at column; review manually';
  END IF;
  IF pg_catalog.to_regclass(format('%I.admin_account_suspension_events',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked admin suspension events table exists';
  END IF;
  ALTER TABLE users ADD COLUMN admin_suspended_at TIMESTAMPTZ;
  CREATE TABLE admin_account_suspension_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_admin_id INTEGER NOT NULL REFERENCES admin_accounts(id),
    action TEXT NOT NULL CHECK (action IN ('suspend','restore')),
    reason VARCHAR(300) NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX admin_account_suspension_events_user_idx
    ON admin_account_suspension_events(user_id,created_at DESC);
  INSERT INTO ustara_schema_migrations(version) VALUES ('20261230_admin_account_suspensions');
END $$;
COMMIT;
