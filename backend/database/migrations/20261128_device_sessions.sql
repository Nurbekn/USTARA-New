-- #84 device list and individual sign-out. No raw bearer tokens or IPs.
-- Forward-only, authorized schema only; use test database before production.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for device sessions';
  END IF;
  PERFORM pg_catalog.set_config('search_path', format('%I,pg_catalog,pg_temp',schema_name), true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261127_manual_account_recovery') THEN
    RAISE EXCEPTION 'Device sessions require previous recovery migration';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261128_device_sessions') THEN
    RAISE EXCEPTION 'Device sessions already applied';
  END IF;
  IF pg_catalog.to_regclass(format('%I.account_device_sessions',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked account_device_sessions table exists';
  END IF;
  CREATE TABLE account_device_sessions (
    session_id CHAR(32) PRIMARY KEY CHECK (session_id ~ '^[0-9a-f]{32}$'),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_label VARCHAR(80) NOT NULL CHECK (length(device_label)>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at>created_at),
    CHECK (revoked_at IS NULL OR revoked_at>=created_at)
  );
  CREATE INDEX account_device_sessions_user_active_idx
    ON account_device_sessions(user_id,expires_at DESC) WHERE revoked_at IS NULL;
  INSERT INTO ustara_schema_migrations(version) VALUES ('20261128_device_sessions');
END $$;
COMMIT;
