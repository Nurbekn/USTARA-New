-- Verified Telegram self-contacts for registration and password-reset OTP delivery.
-- No accounts are created by sharing a contact; existing OTP limits remain authoritative.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261119_telegram_otp_delivery';
  prerequisites CONSTANT TEXT[] := ARRAY[
    '20261114_otp_registration','20261114_security_02_password_reset',
    '20261114_telegram_01_barber_links'
  ];
  marker_count INTEGER;
  table_oid OID;
  applied BOOLEAN;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Telegram OTP: invalid active schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  IF to_regclass(format('%I.ustara_schema_migrations',schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Telegram OTP: migration tracking is required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count<>cardinality(prerequisites) THEN
    RAISE EXCEPTION 'Telegram OTP: prerequisite migrations are missing';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO applied USING version_name;
  table_oid := to_regclass(format('%I.telegram_otp_contacts',schema_name));
  IF applied THEN
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r' AND relpersistence='p'
    ) OR (SELECT count(*) FROM pg_attribute WHERE attrelid=table_oid AND attnum>0 AND NOT attisdropped)<>4
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='bot_id' AND atttypid='bigint'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='phone' AND atttypid='text'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='chat_id' AND atttypid='bigint'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attname='verified_at' AND atttypid='timestamptz'::regtype AND attnotnull)
      OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=table_oid AND c.contype='p' AND c.convalidated
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='bot_id'),(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='phone')]::smallint[])
      OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=table_oid AND c.contype='u' AND c.convalidated
        AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='bot_id'),(SELECT attnum FROM pg_attribute WHERE attrelid=table_oid AND attname='chat_id')]::smallint[])
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=table_oid AND contype='c' AND convalidated
        AND conname IN ('telegram_otp_bot_check','telegram_otp_phone_check','telegram_otp_chat_check'))<>3 THEN
      RAISE EXCEPTION 'Telegram OTP: applied marker does not match the expected schema; manual review required';
    END IF;
    RETURN;
  END IF;
  IF table_oid IS NOT NULL THEN
    RAISE EXCEPTION 'Telegram OTP: untracked table exists; manual review required';
  END IF;
  EXECUTE format('CREATE TABLE %I.telegram_otp_contacts (
    bot_id BIGINT NOT NULL CONSTRAINT telegram_otp_bot_check CHECK (bot_id BETWEEN 1 AND 9007199254740991),
    phone TEXT NOT NULL CONSTRAINT telegram_otp_phone_check CHECK (phone ~ ''^[+][1-9][0-9]{7,14}$''),
    chat_id BIGINT NOT NULL CONSTRAINT telegram_otp_chat_check CHECK (chat_id BETWEEN 1 AND 9007199254740991),
    verified_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(bot_id,phone),
    UNIQUE(bot_id,chat_id)
  )',schema_name);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
