-- Historical bootstrap fixture for immutable migration-chain tests only.
-- Canonical PostgreSQL schema. Existing booking/service profile IDs stay intact.
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('customer','barber')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_accounts (
  id INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT admin_accounts_singleton_id_check CHECK (id = 1)
);

INSERT INTO admin_accounts (id, is_active) VALUES (1, TRUE);

CREATE TABLE customers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE barbers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE services (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE barber_working_hours (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (end_time > start_time),
  UNIQUE (barber_id, day_of_week)
);

CREATE TABLE bookings (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  barber_id INTEGER NOT NULL REFERENCES barbers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  booking_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_barber_time ON bookings (barber_id, booking_time);
