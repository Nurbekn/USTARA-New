-- Ustara database schema (PostgreSQL)
-- Run order matters: parent tables first, child tables after.

-- Customers (regular users)
CREATE TABLE customers (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  phone      VARCHAR(20) NOT NULL UNIQUE,
  password   TEXT NOT NULL,                      -- bcrypt hash, never plain text
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Barbers (must be approved by admin before they are visible to customers)
CREATE TABLE barbers (
  id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                VARCHAR(50) NOT NULL,
  phone               VARCHAR(20) NOT NULL UNIQUE,
  password            TEXT NOT NULL,             -- bcrypt hash
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Services offered by a barber
CREATE TABLE services (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id        INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  name             VARCHAR(50) NOT NULL,
  price            NUMERIC(10,2) NOT NULL CHECK (price > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Weekly working hours: one row per barber per weekday
-- day_of_week: 0 = Sunday ... 6 = Saturday (same as PostgreSQL EXTRACT(DOW))
CREATE TABLE barber_working_hours (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id   INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (barber_id, day_of_week)                -- a barber has one schedule per day
);

-- Bookings
-- Allowed status flow (enforced in code):
--   pending -> confirmed | cancelled
--   confirmed -> completed | cancelled
CREATE TABLE bookings (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  barber_id    INTEGER NOT NULL REFERENCES barbers(id),
  service_id   INTEGER NOT NULL REFERENCES services(id),
  booking_time TIMESTAMPTZ NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Speeds up "find this barber's bookings for a day" queries
CREATE INDEX idx_bookings_barber_time ON bookings (barber_id, booking_time);
