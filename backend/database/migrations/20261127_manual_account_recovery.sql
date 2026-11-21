-- Decision #140: safe manual account-recovery review when previous phone and
-- Telegram cannot be used. This migration NEVER grants access or resets secrets.
-- Apply only against an explicitly approved, backed-up, nonproduction database
-- for verification. Forward-only; never silently reapply to an existing schema.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for manual account recovery';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
      pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261126_account_pause') THEN
    RAISE EXCEPTION 'Manual account recovery requires account pause migration';
  END IF;
  IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261127_manual_account_recovery') THEN
    RAISE EXCEPTION 'Manual account recovery migration already applied; inspect schema';
  END IF;
  IF pg_catalog.to_regclass(format('%I.manual_recovery_cases',schema_name)) IS NOT NULL
    OR pg_catalog.to_regclass(format('%I.manual_recovery_events',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Manual account recovery: untracked tables exist';
  END IF;
  CREATE TABLE manual_recovery_cases (
    id VARCHAR(32) PRIMARY KEY CHECK (id ~ '^[0-9a-f]{32}$'),
    access_token_hash TEXT NOT NULL UNIQUE CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^\+998[0-9]{9}$'),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open','reviewing','verification_needed','closed')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CHECK (updated_at >= created_at)
  );
  CREATE INDEX manual_recovery_cases_status_idx ON manual_recovery_cases(status,created_at DESC);
  CREATE TABLE manual_recovery_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    case_id VARCHAR(32) NOT NULL REFERENCES manual_recovery_cases(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL
      CHECK (event_type IN ('opened','reviewing','verification_needed','closed')),
    admin_account_id INTEGER REFERENCES admin_accounts(id) ON DELETE RESTRICT,
    reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((event_type='opened' AND admin_account_id IS NULL AND reason IS NULL)
      OR (event_type<>'opened' AND admin_account_id IS NOT NULL
        AND reason IS NOT NULL AND length(btrim(reason))>=3))
  );
  CREATE INDEX manual_recovery_events_case_idx ON manual_recovery_events(case_id,created_at);
  INSERT INTO ustara_schema_migrations(version) VALUES('20261127_manual_account_recovery');
END $$;
COMMIT;
