-- v189: one-shot operator-authorized Telegram notices for linked barbers only.
-- The table stores no phone, chat ID, message body or customer personal data.
-- Apply to isolated PostgreSQL first; nothing is sent by this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for suspension telegram notice migration';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261231_admin_suspension_booking_cases') THEN
    RAISE EXCEPTION 'Suspension notice migration requires operator cases';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20270101_admin_suspension_telegram_notices') THEN
    RAISE EXCEPTION 'Suspension notice migration already applied';
  END IF;
  IF pg_catalog.to_regclass(format('%I.admin_suspension_telegram_notices',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked suspension telegram notice table exists';
  END IF;
  CREATE TABLE admin_suspension_telegram_notices (
    id BIGSERIAL PRIMARY KEY,
    case_id BIGINT NOT NULL UNIQUE REFERENCES admin_suspension_booking_cases(id) ON DELETE CASCADE,
    requested_by INTEGER NOT NULL REFERENCES admin_accounts(id),
    status TEXT NOT NULL DEFAULT 'queued'
      CHECK(status IN ('queued','sending','accepted','uncertain','cancelled')),
    claim_id UUID,
    claimed_at TIMESTAMPTZ,
    telegram_message_id BIGINT CHECK (telegram_message_id>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((status IN ('sending','accepted','uncertain') AND claim_id IS NOT NULL AND claimed_at IS NOT NULL)
      OR (status IN ('queued','cancelled') AND claim_id IS NULL AND claimed_at IS NULL)),
    CHECK (telegram_message_id IS NULL OR status='accepted')
  );
  CREATE INDEX admin_suspension_telegram_notices_pending_idx ON admin_suspension_telegram_notices(id)
    WHERE status='queued';
  INSERT INTO ustara_schema_migrations(version) VALUES('20270101_admin_suspension_telegram_notices');
END $$;
COMMIT;
