-- v27: authenticated customer booking confirmation and separate opt-in Telegram offer notices.
-- Forward-only; do not apply without reviewed v26 data and staging integration tests.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for smart booking confirmation';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261208_smart_booking_offers') THEN
  RAISE EXCEPTION 'Smart booking confirmation requires v26 migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261209_smart_booking_confirmation')
  OR pg_catalog.to_regclass('smart_booking_confirmations') IS NOT NULL
  OR pg_catalog.to_regclass('smart_booking_telegram_outbox') IS NOT NULL THEN
  RAISE EXCEPTION 'Smart booking confirmation already applied or untracked';
 END IF;
 CREATE TABLE smart_booking_confirmations (
  offer_id BIGINT PRIMARY KEY REFERENCES smart_booking_offers(id) ON DELETE CASCADE,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX smart_booking_accepted_due ON smart_booking_openings(next_check_at,id)
  WHERE state='accepted';
 -- Notification consent for *offers* is distinct from v25 queue-call consent.
 ALTER TABLE walkin_queue_telegram_subscriptions ADD COLUMN offers_consent_at TIMESTAMPTZ;
 CREATE TABLE smart_booking_telegram_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id BIGINT NOT NULL UNIQUE REFERENCES smart_booking_offers(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL CHECK(chat_id>0),
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','sending','sent','failed','uncertain','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  telegram_message_id BIGINT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT smart_offer_delivery_lease CHECK
    ((status='sending')=(lease_owner IS NOT NULL AND lease_until IS NOT NULL))
 );
 CREATE INDEX smart_offer_telegram_ready ON smart_booking_telegram_outbox(next_attempt_at,id)
  WHERE status='pending';
 CREATE INDEX smart_offer_telegram_message ON smart_booking_telegram_outbox(chat_id,telegram_message_id)
  WHERE status='sent';
 INSERT INTO ustara_schema_migrations(version) VALUES('20261209_smart_booking_confirmation');
END $$;
COMMIT;
