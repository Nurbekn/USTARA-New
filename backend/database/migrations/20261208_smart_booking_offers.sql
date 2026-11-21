-- v26: five-minute QR waitlist invitations after same-day booking cancellation.
-- An accepted invitation is NOT a booking or a held slot. Forward only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for smart booking offers';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261207_queue_telegram_notifications') THEN
  RAISE EXCEPTION 'v26 needs v25 queue Telegram migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261208_smart_booking_offers')
    OR pg_catalog.to_regclass('smart_booking_openings') IS NOT NULL
    OR pg_catalog.to_regclass('smart_booking_offers') IS NOT NULL THEN
  RAISE EXCEPTION 'Smart booking migration already applied or untracked';
 END IF;
 CREATE TABLE smart_booking_openings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_booking_id INTEGER NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0 AND duration_minutes<=1440),
  state VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(state IN ('open','offered','accepted','cancelled','closed')),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX smart_booking_openings_due ON smart_booking_openings(next_check_at,id)
  WHERE state IN ('open','offered');
 CREATE TABLE smart_booking_offers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  opening_id BIGINT NOT NULL REFERENCES smart_booking_openings(id) ON DELETE CASCADE,
  entry_id BIGINT NOT NULL REFERENCES walkin_queue(id) ON DELETE CASCADE,
  status VARCHAR(12) NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','accepted','rejected','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT smart_booking_offer_once UNIQUE(opening_id,entry_id),
  CONSTRAINT smart_booking_offer_dates CHECK(expires_at>created_at),
  CONSTRAINT smart_booking_offer_decision CHECK ((status='pending')=(decided_at IS NULL))
 );
 CREATE UNIQUE INDEX smart_booking_one_pending_opening ON smart_booking_offers(opening_id)
  WHERE status='pending';
 CREATE UNIQUE INDEX smart_booking_one_pending_entry ON smart_booking_offers(entry_id)
  WHERE status='pending';
 CREATE INDEX smart_booking_offers_entry_status ON smart_booking_offers(entry_id,id DESC);
 -- Booking cancellation (including Telegram, DELETE and PUT) creates one durable
 -- opening in the SAME transaction. No opening for tomorrow or already-started time.
 INSERT INTO ustara_schema_migrations(version) VALUES('20261208_smart_booking_offers');
END $$;
 CREATE FUNCTION ustara_smart_opening_on_cancel() RETURNS TRIGGER LANGUAGE plpgsql AS $offer$
 BEGIN
  IF OLD.status IN ('pending','confirmed') AND NEW.status='cancelled'
    AND NEW.duration_minutes BETWEEN 1 AND 1440
    AND NEW.booking_time>clock_timestamp()+interval '5 minutes'
    AND (NEW.booking_time AT TIME ZONE 'Asia/Tashkent')::date
      = (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date
    AND ((NEW.booking_time + NEW.duration_minutes*interval '1 minute') AT TIME ZONE 'Asia/Tashkent')::date
      = (clock_timestamp() AT TIME ZONE 'Asia/Tashkent')::date THEN
   INSERT INTO smart_booking_openings(source_booking_id,barber_id,start_at,duration_minutes)
   VALUES(NEW.id,NEW.barber_id,NEW.booking_time,NEW.duration_minutes)
   ON CONFLICT(source_booking_id) DO NOTHING;
  END IF;
  RETURN NEW;
 END;
 $offer$;
 CREATE TRIGGER ustara_smart_opening_booking_cancel
  AFTER UPDATE OF status ON bookings FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION ustara_smart_opening_on_cancel();
COMMIT;
