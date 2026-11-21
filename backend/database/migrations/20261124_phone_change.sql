-- Forward-only; apply before deploying the matching API and Telegram worker.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261124_phone_change';
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Phone change: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261123_registration_resend_cooldown') THEN
    RAISE EXCEPTION 'Phone change: prerequisite migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=version_name) THEN
    RAISE EXCEPTION 'Phone change: already applied; inspect schema instead of rerunning';
  END IF;
  CREATE TABLE phone_change_requests (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL UNIQUE CHECK (id ~ '^[0-9a-f]{64}$'),
    session_token_hash TEXT NOT NULL UNIQUE CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
    session_version INTEGER NOT NULL CHECK (session_version>=0),
    old_phone TEXT NOT NULL CHECK (old_phone ~ '^[+][1-9][0-9]{7,14}$'),
    new_phone TEXT CHECK (new_phone ~ '^[+]998[0-9]{9}$' AND new_phone<>old_phone),
    bot_id BIGINT NOT NULL CHECK (bot_id>0),
    bot_token_hash TEXT NOT NULL UNIQUE CHECK (bot_token_hash ~ '^[0-9a-f]{64}$'),
    chat_id BIGINT CHECK (chat_id>0),
    context_active BOOLEAN NOT NULL DEFAULT FALSE,
    otp_hmac_hash TEXT CHECK (otp_hmac_hash ~ '^[0-9a-f]{64}$'),
    otp_hmac_key_id TEXT,
    otp_issuance_nonce TEXT,
    otp_sent_at TIMESTAMPTZ,
    otp_expires_at TIMESTAMPTZ,
    otp_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (otp_failed_attempts BETWEEN 0 AND 5),
    send_count INTEGER NOT NULL DEFAULT 0 CHECK (send_count BETWEEN 0 AND 3),
    resend_available_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    CHECK (expires_at=created_at+INTERVAL '10 minutes'),
    CHECK (otp_sent_at IS NULL OR (new_phone IS NOT NULL AND chat_id IS NOT NULL
      AND otp_expires_at=otp_sent_at+INTERVAL '1 minute' AND resend_available_at=otp_expires_at))
  );
  -- Active reservations are serialized with transaction advisory locks. Expired
  -- requests never reserve a phone/chat; no time-dependent partial UNIQUE index.
  CREATE INDEX phone_change_phone_idx ON phone_change_requests(new_phone) WHERE completed_at IS NULL;
  CREATE INDEX phone_change_chat_idx ON phone_change_requests(bot_id,chat_id) WHERE completed_at IS NULL;
  CREATE TABLE phone_change_notices (
    request_id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    bot_id BIGINT NOT NULL CHECK (bot_id>0),
    chat_id BIGINT NOT NULL CHECK (chat_id>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    sent_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0),
    retry_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX phone_change_notices_pending_idx ON phone_change_notices(retry_at) WHERE sent_at IS NULL;
  INSERT INTO ustara_schema_migrations(version) VALUES(version_name);
END $$;
COMMIT;
