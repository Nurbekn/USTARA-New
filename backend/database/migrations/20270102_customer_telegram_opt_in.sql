-- v190: standalone explicit customer Telegram binding; no notifications sent.
-- OTP contact verification is NOT notification consent. Do not backfill from OTP.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for customer Telegram migration';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20270101_admin_suspension_telegram_notices') THEN
    RAISE EXCEPTION 'Customer Telegram migration requires v189';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20270102_customer_telegram_opt_in') THEN
    RAISE EXCEPTION 'Customer Telegram migration already applied';
  END IF;
  IF pg_catalog.to_regclass(format('%I.customer_telegram_links',schema_name)) IS NOT NULL OR
     pg_catalog.to_regclass(format('%I.customer_telegram_link_tokens',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked customer Telegram object exists';
  END IF;
  CREATE TABLE customer_telegram_links (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    chat_id BIGINT NOT NULL UNIQUE CHECK(chat_id>0 AND chat_id<=9007199254740991),
    linked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    notification_opt_in_at TIMESTAMPTZ
  );
  CREATE TABLE customer_telegram_link_tokens (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    session_version INTEGER NOT NULL CHECK(session_version>=0),
    CONSTRAINT customer_telegram_expiry_v190 CHECK(expires_at=created_at+INTERVAL '5 minutes')
  );
  CREATE INDEX customer_telegram_link_tokens_expiry_idx ON customer_telegram_link_tokens(expires_at);
  INSERT INTO ustara_schema_migrations(version) VALUES('20270102_customer_telegram_opt_in');
END $$;
COMMIT;
