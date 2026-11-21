-- Forward-only. Prepare/review separately; execution requires explicit approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261121_telegram_auth_hardening';
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Telegram auth: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261120_telegram_registration_requests') THEN
    RAISE EXCEPTION 'Telegram auth: prerequisite migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=version_name) THEN
    RAISE EXCEPTION 'Telegram auth: already applied; inspect schema instead of rerunning';
  END IF;
  -- Old contact rows remain unlinked. Never infer account ownership from phone.
  ALTER TABLE telegram_otp_contacts ADD COLUMN user_id INTEGER
    REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE telegram_otp_contacts ADD CONSTRAINT telegram_otp_account_unique UNIQUE(bot_id,user_id);
  ALTER TABLE telegram_otp_contacts DROP CONSTRAINT telegram_otp_chat_check;
  ALTER TABLE telegram_otp_contacts ADD CONSTRAINT telegram_otp_chat_check CHECK (chat_id > 0);
  ALTER TABLE telegram_registration_requests DROP CONSTRAINT telegram_registration_requests_chat_id_check;
  ALTER TABLE telegram_registration_requests ADD CONSTRAINT telegram_registration_requests_chat_id_check CHECK (chat_id > 0);
  ALTER TABLE password_reset_requests ADD COLUMN delivered_at TIMESTAMPTZ;
  CREATE TABLE otp_request_limits (
    scope TEXT NOT NULL CHECK (scope IN ('telegram','ip:start','ip:resend','ip:verify','ip:complete','ip:status')),
    key_hash TEXT NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    window_started_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL CHECK (request_count > 0),
    PRIMARY KEY(scope,key_hash)
  );
  CREATE INDEX otp_request_limits_expiry_idx ON otp_request_limits(window_started_at);
  CREATE TABLE telegram_webhook_receipts (
    bot_id BIGINT NOT NULL CHECK (bot_id > 0),
    update_id BIGINT NOT NULL CHECK (update_id >= 0),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(bot_id,update_id)
  );
  CREATE INDEX telegram_webhook_receipts_expiry_idx ON telegram_webhook_receipts(processed_at);
  INSERT INTO ustara_schema_migrations(version) VALUES(version_name);
END $$;
COMMIT;
