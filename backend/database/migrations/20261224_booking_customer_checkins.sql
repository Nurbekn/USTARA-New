-- #102: customer arrival request and explicit acceptance by the booking's barber.
-- Check-in is informational and MUST NOT update bookings.status or booking_time.
CREATE TABLE IF NOT EXISTS booking_checkins (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by_barber_id INTEGER REFERENCES barbers(id) ON DELETE RESTRICT,
  CONSTRAINT booking_checkins_confirmation_consistent CHECK (
    (confirmed_at IS NULL AND confirmed_by_barber_id IS NULL)
    OR (confirmed_at IS NOT NULL AND confirmed_by_barber_id IS NOT NULL)
  )
);

-- A moved appointment must never retain an arrival check-in from the old slot.
-- The same booking row lock serializes this invalidation with both check-in APIs.
CREATE FUNCTION ustara_invalidate_checkin_on_reschedule()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM booking_checkins WHERE booking_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_checkins_clear_on_reschedule
AFTER UPDATE OF booking_time ON bookings
FOR EACH ROW WHEN (OLD.booking_time IS DISTINCT FROM NEW.booking_time)
EXECUTE FUNCTION ustara_invalidate_checkin_on_reschedule();
