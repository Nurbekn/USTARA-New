-- Registration begins on the website; OTP delivery waits for matching self-contact in the bot.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261120_telegram_registration_requests';
  prerequisites CONSTANT TEXT[] := ARRAY['20261114_otp_registration','20261119_telegram_otp_delivery'];
  marker_count INTEGER;
  applied BOOLEAN;
  target_oid OID;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Telegram registration: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  IF to_regclass(format('%I.ustara_schema_migrations',schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Telegram registration: migration tracking is required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count<>cardinality(prerequisites) THEN RAISE EXCEPTION 'Telegram registration: prerequisite migrations are missing'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name) INTO applied USING version_name;
  target_oid := to_regclass(format('%I.telegram_registration_requests',schema_name));
  IF applied THEN
    IF target_oid IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=target_oid AND relkind='r' AND relpersistence='p')
      OR (SELECT count(*) FROM pg_attribute WHERE attrelid=target_oid AND attnum>0 AND NOT attisdropped)<>6
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='registration_id' AND atttypid='bigint'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='token_hash' AND atttypid='text'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='bot_id' AND atttypid='bigint'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='chat_id' AND atttypid='bigint'::regtype AND NOT attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='expires_at' AND atttypid='timestamptz'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=target_oid AND attname='delivered_at' AND atttypid='timestamptz'::regtype AND NOT attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=target_oid AND contype='f' AND confrelid='pending_registrations'::regclass AND confdeltype='c' AND convalidated)
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=target_oid AND contype='p' AND convalidated)
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=target_oid AND contype='u' AND convalidated)<>1
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=target_oid AND contype='c' AND convalidated)<>3
      OR NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        WHERE i.indrelid=target_oid AND c.relname='telegram_registration_chat_idx'
          AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL) THEN
      RAISE EXCEPTION 'Telegram registration: applied marker/schema mismatch; manual review required';
    END IF;
    RETURN;
  END IF;
  IF target_oid IS NOT NULL THEN RAISE EXCEPTION 'Telegram registration: untracked table exists'; END IF;
  EXECUTE format('CREATE TABLE %I.telegram_registration_requests (
    registration_id BIGINT PRIMARY KEY REFERENCES %I.pending_registrations(id) ON DELETE CASCADE,
    bot_id BIGINT NOT NULL CHECK (bot_id BETWEEN 1 AND 9007199254740991),
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ ''^[0-9a-f]{64}$''),
    chat_id BIGINT CHECK (chat_id BETWEEN 1 AND 9007199254740991),
    expires_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ
  )',schema_name,schema_name);
  EXECUTE format('CREATE UNIQUE INDEX telegram_registration_chat_idx ON %I.telegram_registration_requests(bot_id,chat_id) WHERE chat_id IS NOT NULL',schema_name);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
