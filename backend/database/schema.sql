-- Current core schema reference, including split profile names.
-- Historical migration-chain tests start from test/fixtures/pre_otp_schema.sql,
-- not this post-migration reference (OTP adds the split columns itself).
-- OTP storage and migration metadata are managed by the migration chain.
SELECT set_config('search_path', format('%I, pg_catalog, pg_temp', current_schema()), false);
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('customer','barber')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ
);
ALTER TABLE users ADD CONSTRAINT users_id_role_key UNIQUE (id,role);

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
  user_id INTEGER NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role='customer'),
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  CONSTRAINT customers_user_role_fkey FOREIGN KEY(user_id,role) REFERENCES users(id,role) ON DELETE CASCADE,
  CONSTRAINT customers_first_name_nonblank_check CHECK (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
  CONSTRAINT customers_last_name_nonblank_check CHECK (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE barbers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'barber' CHECK (role='barber'),
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  CONSTRAINT barbers_user_role_fkey FOREIGN KEY(user_id,role) REFERENCES users(id,role) ON DELETE CASCADE,
  CONSTRAINT barbers_first_name_nonblank_check CHECK (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
  CONSTRAINT barbers_last_name_nonblank_check CHECK (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
  specialty VARCHAR(20) NOT NULL CONSTRAINT barbers_specialty_check
    CHECK (specialty IN ('barber','cosmetolog','stylist')),
  salon_name TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  experience_years INTEGER,
  bio VARCHAR(200),
  avatar_url TEXT,
  accepting_bookings BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT barbers_location_check CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
      (latitude IS NOT NULL AND longitude IS NOT NULL
       AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  CONSTRAINT barbers_experience_years_check CHECK (
    experience_years IS NULL OR experience_years BETWEEN 0 AND 99
  ),
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
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','completed','cancelled','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_barber_time ON bookings (barber_id, booking_time);

-- Requires btree_gist to be preinstalled in public by an administrator.
ALTER TABLE bookings ADD CONSTRAINT bookings_active_time_excl
  EXCLUDE USING gist (
    barber_id public.gist_int4_ops WITH =,
    (tsrange(booking_time AT TIME ZONE 'UTC',
      (booking_time AT TIME ZONE 'UTC') + duration_minutes * INTERVAL '1 minute', '[)')) WITH &&
  ) WHERE (status IN ('pending','confirmed'));

CREATE FUNCTION ustara_reject_user_role_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'users.role is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION ustara_lock_profile_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE v_ids INTEGER[]; v_old INTEGER; v_new INTEGER; v_id INTEGER;
BEGIN
  IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
    FROM unnest(ARRAY[v_old,v_new]) AS candidates(id) WHERE id IS NOT NULL;
  IF v_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_ids LOOP
      PERFORM id FROM users WHERE id=v_id FOR UPDATE;
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION ustara_assert_profile_invariant(p_user_id INTEGER) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE v_role TEXT; v_customers BIGINT; v_barbers BIGINT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id=p_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*) INTO v_customers FROM customers WHERE user_id=p_user_id;
  SELECT count(*) INTO v_barbers FROM barbers WHERE user_id=p_user_id;
  IF (v_role='customer' AND (v_customers<>1 OR v_barbers<>0))
     OR (v_role='barber' AND (v_barbers<>1 OR v_customers<>0)) THEN
    RAISE EXCEPTION 'Account/profile invariant failed for user %',p_user_id USING ERRCODE='23514';
  END IF;
END $$;

CREATE FUNCTION ustara_check_profile_invariant_deferred() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE v_old INTEGER; v_new INTEGER;
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF TG_OP<>'INSERT' THEN v_old := OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN v_new := NEW.id; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
  END IF;
  IF v_old IS NOT NULL THEN PERFORM ustara_assert_profile_invariant(v_old); END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM ustara_assert_profile_invariant(v_new); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER users_role_immutable_trg BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION ustara_reject_user_role_change();
CREATE TRIGGER customers_profile_parent_lock_trg BEFORE INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION ustara_lock_profile_accounts();
CREATE TRIGGER barbers_profile_parent_lock_trg BEFORE INSERT OR UPDATE OR DELETE ON barbers
  FOR EACH ROW EXECUTE FUNCTION ustara_lock_profile_accounts();
CREATE CONSTRAINT TRIGGER users_profile_integrity_ct AFTER INSERT OR DELETE ON users
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();
CREATE CONSTRAINT TRIGGER customers_profile_integrity_ct AFTER INSERT OR DELETE OR UPDATE OF user_id ON customers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();
CREATE CONSTRAINT TRIGGER barbers_profile_integrity_ct AFTER INSERT OR DELETE OR UPDATE OF user_id ON barbers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();

REVOKE ALL ON FUNCTION ustara_reject_user_role_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION ustara_lock_profile_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION ustara_assert_profile_invariant(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION ustara_check_profile_invariant_deferred() FROM PUBLIC;
