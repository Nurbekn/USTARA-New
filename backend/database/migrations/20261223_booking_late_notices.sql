-- v169 / decision #101. A notice records customer intent; never moves an appointment.
-- One immutable notice per booking prevents duplicate submissions on retries.
CREATE TABLE IF NOT EXISTS booking_late_notices (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  minutes_late SMALLINT NOT NULL CHECK (minutes_late IN (5,10,15,20,30)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
