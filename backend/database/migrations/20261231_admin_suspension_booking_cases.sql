-- v188: operator follow-up for bookings affected by an account suspension.
-- No automatic booking changes or SMS/Telegram deliveries. Apply to staging first.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for suspension case migration';
  END IF;
  PERFORM pg_catalog.set_config('search_path', format('%I,pg_catalog,pg_temp',schema_name), true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261230_admin_account_suspensions') THEN
    RAISE EXCEPTION 'Suspension cases require the account suspension migration';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261231_admin_suspension_booking_cases') THEN
    RAISE EXCEPTION 'Suspension cases migration already applied';
  END IF;
  IF pg_catalog.to_regclass(format('%I.admin_suspension_booking_cases',schema_name)) IS NOT NULL OR
     pg_catalog.to_regclass(format('%I.admin_suspension_booking_case_events',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked suspension case tables exist';
  END IF;
  CREATE TABLE admin_suspension_booking_cases (
    id BIGSERIAL PRIMARY KEY,
    suspension_event_id BIGINT NOT NULL REFERENCES admin_account_suspension_events(id) ON DELETE CASCADE,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','attempted','closed')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (suspension_event_id,booking_id)
  );
  CREATE INDEX admin_suspension_cases_status_idx ON admin_suspension_booking_cases(status,id DESC);
  CREATE TABLE admin_suspension_booking_case_events (
    id BIGSERIAL PRIMARY KEY,
    case_id BIGINT NOT NULL REFERENCES admin_suspension_booking_cases(id) ON DELETE CASCADE,
    actor_admin_id INTEGER NOT NULL REFERENCES admin_accounts(id),
    action TEXT NOT NULL CHECK (action IN ('review','attempt','close')),
    channel TEXT CHECK (channel IN ('phone','telegram','other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((action='attempt' AND channel IS NOT NULL) OR (action<>'attempt' AND channel IS NULL))
  );
  CREATE INDEX admin_suspension_case_events_case_idx ON admin_suspension_booking_case_events(case_id,id DESC);
  -- Backfill OPEN bookings for accounts suspended before v188 deployment.
  -- Only inserts into new operator case tables; does not change booking rows.
  INSERT INTO admin_suspension_booking_cases(suspension_event_id,booking_id)
  SELECT latest.id, b.id FROM (
    SELECT DISTINCT ON (e.user_id) e.id,e.user_id
      FROM admin_account_suspension_events e
      JOIN users u ON u.id=e.user_id AND u.admin_suspended_at IS NOT NULL
      WHERE e.action='suspend'
      ORDER BY e.user_id,e.created_at DESC,e.id DESC
  ) latest
  JOIN barbers p ON p.user_id=latest.user_id
  JOIN bookings b ON b.barber_id=p.id
  WHERE b.status IN ('pending','confirmed')
    AND b.booking_time+b.duration_minutes*INTERVAL '1 minute'>clock_timestamp()
  UNION ALL
  SELECT latest.id,b.id FROM (
    SELECT DISTINCT ON (e.user_id) e.id,e.user_id
      FROM admin_account_suspension_events e
      JOIN users u ON u.id=e.user_id AND u.admin_suspended_at IS NOT NULL
      WHERE e.action='suspend'
      ORDER BY e.user_id,e.created_at DESC,e.id DESC
  ) latest
  JOIN customers p ON p.user_id=latest.user_id
  JOIN bookings b ON b.customer_id=p.id
  WHERE b.status IN ('pending','confirmed')
    AND b.booking_time+b.duration_minutes*INTERVAL '1 minute'>clock_timestamp()
  ON CONFLICT DO NOTHING;
  INSERT INTO ustara_schema_migrations(version) VALUES ('20261231_admin_suspension_booking_cases');
END $$;
COMMIT;
