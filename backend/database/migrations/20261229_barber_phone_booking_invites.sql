-- v185 / #160 #176. A phone call produces a consent-only invite, never a booking.
-- Operator-review migration; does NOT send SMS, reserve slots or enroll customers.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe phone booking invitation schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261228_private_booking_notes') THEN
  RAISE EXCEPTION 'Phone invites require preceding private notes migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261229_barber_phone_booking_invites')
   OR pg_catalog.to_regclass('barber_phone_booking_invites') IS NOT NULL THEN
  RAISE EXCEPTION 'Phone invites already recorded or partially applied';
 END IF;
END $$;
CREATE TABLE barber_phone_booking_invites (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  booking_time TIMESTAMPTZ NOT NULL,
  token_digest CHAR(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp() + INTERVAL '30 minutes'),
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX barber_phone_booking_invites_owner_latest_idx
  ON barber_phone_booking_invites(barber_id,id DESC);
-- Deliberately no phone number or customer_id; possession of this token NEVER
-- allows a third party to book for an account. Only a logged-in customer can book.
INSERT INTO ustara_schema_migrations(version) VALUES ('20261229_barber_phone_booking_invites');
COMMIT;
