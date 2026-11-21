-- Forward-only. Deploy before the matching API and bot worker; stop old writers first.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261122_telegram_phone_requests';
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Telegram phone requests: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261121_telegram_auth_hardening') THEN
    RAISE EXCEPTION 'Telegram phone requests: prerequisite migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=version_name) THEN
    RAISE EXCEPTION 'Telegram phone requests: already applied; inspect schema';
  END IF;
  -- A chat may have historical requests. Phone uniqueness lives on pending_registrations;
  -- delivery holds the phone-limit, pending and request locks in that order.
  LOCK TABLE telegram_registration_requests IN ACCESS EXCLUSIVE MODE;
  DROP INDEX telegram_registration_chat_idx;
  CREATE INDEX telegram_registration_chat_idx ON telegram_registration_requests(bot_id,chat_id) WHERE chat_id IS NOT NULL;
  -- Keep existing rows and the internal generation field so old sessions can finish
  -- through self-contact. reg_ payloads no longer confer a delivery capability.
  INSERT INTO ustara_schema_migrations(version) VALUES(version_name);
END $$;
COMMIT;
