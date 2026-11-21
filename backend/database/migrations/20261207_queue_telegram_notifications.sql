-- v25: queue call notices by explicit QR-ticket holder opt-in. Forward-only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for queue Telegram notices';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261206_queue_order_qr_settings') THEN
  RAISE EXCEPTION 'Queue Telegram notices require v23 QR settings migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261207_queue_telegram_notifications')
  OR pg_catalog.to_regclass('walkin_queue_telegram_invites') IS NOT NULL
  OR pg_catalog.to_regclass('walkin_queue_telegram_subscriptions') IS NOT NULL
  OR pg_catalog.to_regclass('walkin_queue_notification_outbox') IS NOT NULL THEN
  RAISE EXCEPTION 'Queue Telegram migration already applied or untracked';
 END IF;
 CREATE TABLE walkin_queue_telegram_invites (
  entry_id BIGINT PRIMARY KEY REFERENCES walkin_queue(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  consumed_at TIMESTAMPTZ,
  CONSTRAINT queue_invite_lifetime CHECK(expires_at>created_at)
 );
 CREATE TABLE walkin_queue_telegram_subscriptions (
  entry_id BIGINT PRIMARY KEY REFERENCES walkin_queue(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL CHECK(chat_id>0),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX walkin_queue_telegram_subscriptions_chat ON walkin_queue_telegram_subscriptions(chat_id);
 CREATE TABLE walkin_queue_notification_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES walkin_queue(id) ON DELETE CASCADE,
  event VARCHAR(16) NOT NULL CHECK(event='called'),
  chat_id BIGINT NOT NULL CHECK(chat_id>0),
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','processing','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=6),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  telegram_message_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT queue_telegram_event_once UNIQUE(entry_id,event),
  CONSTRAINT queue_delivery_lease CHECK ((status='processing')=(lease_owner IS NOT NULL AND lease_until IS NOT NULL))
 );
 CREATE INDEX queue_telegram_ready ON walkin_queue_notification_outbox(next_attempt_at,id)
  WHERE status IN ('pending','processing');
 INSERT INTO ustara_schema_migrations(version) VALUES ('20261207_queue_telegram_notifications');
END $$;
COMMIT;
