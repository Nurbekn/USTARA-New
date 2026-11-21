-- Social feed, barber portfolio, customer profile fields and booking reviews.
-- Apply only after the listed account/profile/booking migrations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261118_social_portfolio_reviews';
  prerequisites CONSTANT TEXT[] := ARRAY[
    '20261113_00_users_foundation',
    '20261113_unified_accounts',
    '20261114_otp_registration_02_profile_names',
    '20261114_slots_01_booking_duration',
    '20261117_barber_profile_02_booking_acceptance'
  ];
  tracking_oid OID;
  customers_oid OID;
  applied BOOLEAN;
  marker_count INTEGER;
  existing_objects INTEGER;
  profile_columns INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Social migration: invalid active schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  tracking_oid := to_regclass(format('%I.ustara_schema_migrations',schema_name));
  customers_oid := to_regclass(format('%I.customers',schema_name));
  IF tracking_oid IS NULL OR customers_oid IS NULL THEN
    RAISE EXCEPTION 'Social migration: migration tracking and customers tables are required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('LOCK TABLE ONLY %I.customers IN ACCESS EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count<>cardinality(prerequisites) THEN
    RAISE EXCEPTION 'Social migration: prerequisite markers are missing';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO applied USING version_name;
  IF applied THEN
    SELECT count(*) INTO existing_objects FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=schema_name AND c.relkind='r'
        AND c.relname=ANY(ARRAY['ustara_media','social_posts','social_comments','social_likes','social_saves','social_follows','social_reports','barber_reviews']);
    SELECT count(*) INTO profile_columns FROM pg_attribute
      WHERE attrelid=customers_oid AND attnum>0 AND NOT attisdropped
        AND attname=ANY(ARRAY['avatar_url','address','latitude','longitude']);
    IF existing_objects<>8 OR profile_columns<>4 THEN
      RAISE EXCEPTION 'Social migration: applied marker does not match the expected schema';
    END IF;
    RETURN;
  END IF;

  SELECT count(*) INTO existing_objects FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=schema_name AND c.relname=ANY(ARRAY['ustara_media','social_posts','social_comments','social_likes','social_saves','social_follows','social_reports','barber_reviews']);
  SELECT count(*) INTO profile_columns FROM pg_attribute
    WHERE attrelid=customers_oid AND attnum>0 AND NOT attisdropped
      AND attname=ANY(ARRAY['avatar_url','address','latitude','longitude']);
  IF existing_objects<>0 OR profile_columns<>0 THEN
    RAISE EXCEPTION 'Social migration: untracked schema objects exist; inspect manually';
  END IF;

  EXECUTE format('ALTER TABLE %I.customers
    ADD COLUMN avatar_url TEXT,
    ADD COLUMN address TEXT,
    ADD COLUMN latitude DOUBLE PRECISION,
    ADD COLUMN longitude DOUBLE PRECISION,
    ADD CONSTRAINT customers_location_check CHECK (
      (latitude IS NULL AND longitude IS NULL) OR
      (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    )',schema_name);

  EXECUTE format('CREATE TABLE %I.ustara_media (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN (''image/jpeg'',''image/png'',''image/webp'',''video/mp4'',''video/webm'')),
    content BYTEA NOT NULL,
    byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 1 AND 104857600 AND octet_length(content)=byte_length),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )',schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.social_posts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    barber_id INTEGER NOT NULL REFERENCES %I.barbers(id) ON DELETE CASCADE,
    caption VARCHAR(2000) NOT NULL DEFAULT '''',
    kind TEXT NOT NULL DEFAULT ''standard'' CHECK (kind IN (''standard'',''beforeAfter'')),
    service_id INTEGER REFERENCES %I.services(id) ON DELETE SET NULL,
    media_ids BIGINT[] NOT NULL CHECK (cardinality(media_ids) BETWEEN 1 AND 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE INDEX social_posts_feed_idx ON %I.social_posts(created_at DESC,id DESC)',schema_name);
  EXECUTE format('CREATE TABLE %I.social_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES %I.social_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    text VARCHAR(500) NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id,user_id,created_at)
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.social_likes (
    post_id BIGINT NOT NULL REFERENCES %I.social_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(post_id,user_id)
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.social_saves (
    post_id BIGINT NOT NULL REFERENCES %I.social_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(post_id,user_id)
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.social_follows (
    customer_user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    barber_id INTEGER NOT NULL REFERENCES %I.barbers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(customer_user_id,barber_id)
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.social_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES %I.social_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
    reason VARCHAR(40) NOT NULL CHECK (reason IN (''spam'',''inappropriate'',''misleading'',''other'')),
    details VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id,user_id)
  )',schema_name,schema_name,schema_name);
  EXECUTE format('CREATE TABLE %I.barber_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id INTEGER NOT NULL UNIQUE REFERENCES %I.bookings(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES %I.customers(id) ON DELETE CASCADE,
    barber_id INTEGER NOT NULL REFERENCES %I.barbers(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text VARCHAR(1000) NOT NULL DEFAULT '''' CHECK (length(text)<=1000),
    reply VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )',schema_name,schema_name,schema_name,schema_name);
  EXECUTE format('CREATE INDEX barber_reviews_barber_idx ON %I.barber_reviews(barber_id,created_at DESC,id DESC)',schema_name);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1)',schema_name) USING version_name;
END $$;
COMMIT;
