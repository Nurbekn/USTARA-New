-- v182 / #179: privately scoped barber notes. Review and back up before applying.
-- Fresh bootstrap or explicit reviewed migration only. Do not auto-run in production.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe private booking note schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261227_shop_gallery_posts') THEN
  RAISE EXCEPTION 'Private booking notes require previous shop gallery migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261228_private_booking_notes')
   OR pg_catalog.to_regclass('booking_private_notes') IS NOT NULL THEN
  RAISE EXCEPTION 'Private booking notes already recorded or partially applied';
 END IF;
END $$;
CREATE TABLE booking_private_notes (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 500 AND note = btrim(note)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483646),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX booking_private_notes_expiry_idx ON booking_private_notes(expires_at);

-- A transferred booking must not hand the former barber's private text to a new barber.
-- Expiry follows rescheduled appointment time, and is never a client-supplied timestamp.
CREATE FUNCTION ustara_private_note_booking_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.barber_id IS DISTINCT FROM OLD.barber_id THEN
    DELETE FROM booking_private_notes WHERE booking_id = NEW.id;
  ELSIF NEW.booking_time IS DISTINCT FROM OLD.booking_time THEN
    UPDATE booking_private_notes SET expires_at = NEW.booking_time + INTERVAL '90 days'
    WHERE booking_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_private_notes_on_booking_change
AFTER UPDATE OF booking_time, barber_id ON bookings
FOR EACH ROW WHEN (OLD.booking_time IS DISTINCT FROM NEW.booking_time OR OLD.barber_id IS DISTINCT FROM NEW.barber_id)
EXECUTE FUNCTION ustara_private_note_booking_guard();

INSERT INTO ustara_schema_migrations(version) VALUES ('20261228_private_booking_notes');
COMMIT;
