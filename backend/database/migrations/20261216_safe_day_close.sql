-- v107 / #153: reversible, audited, date-scoped barber day closure.
-- Forward-only migration: no guest queue / booking / offer data is touched.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for safe day close';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
  pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261215_walkin_arrived') THEN
  RAISE EXCEPTION 'Safe day close requires the arrived queue migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261216_safe_day_close')
 OR pg_catalog.to_regclass('barber_day_closures') IS NOT NULL
 OR pg_catalog.to_regclass('barber_day_close_events') IS NOT NULL THEN
  RAISE EXCEPTION 'Day close migration already applied or partially present';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname='ustara_effective_day_schedule'
  AND pronamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=schema_name)) THEN
  RAISE EXCEPTION 'Effective day schedule missing';
 END IF;
 CREATE TABLE barber_day_closures (
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT true,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 2147483647),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  closed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopened_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY(barber_id,local_date),
  CONSTRAINT barber_day_closures_state CHECK (
    (is_closed AND reopened_at IS NULL AND reopened_by_user_id IS NULL) OR
    (NOT is_closed AND reopened_at IS NOT NULL)
  )
 );
 CREATE TABLE barber_day_close_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK(action IN ('closed','reopened')),
  revision INTEGER NOT NULL CHECK(revision>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(barber_id,local_date,revision)
 );
 -- All calendar/booking/QR/walk-in flows already call this shared helper.
 -- Closed today does not close tomorrow; reopening restores the normal schedule.
 EXECUTE $function$
 CREATE OR REPLACE FUNCTION ustara_effective_day_schedule(p_barber_id INTEGER,p_date DATE)
 RETURNS TABLE(start_time TIME,end_time TIME,break_start TIME,break_end TIME)
 LANGUAGE SQL STABLE SET search_path FROM CURRENT AS $body$
   SELECT CASE WHEN e.barber_id IS NOT NULL THEN e.start_time ELSE h.start_time END,
          CASE WHEN e.barber_id IS NOT NULL THEN e.end_time ELSE h.end_time END,
          e.break_start,e.break_end
   FROM (SELECT 1) seed
   LEFT JOIN barber_working_hours h ON h.barber_id=p_barber_id AND h.day_of_week=EXTRACT(DOW FROM p_date)::int
   LEFT JOIN barber_calendar_exceptions e ON e.barber_id=p_barber_id AND e.local_date=p_date
   WHERE NOT EXISTS (SELECT 1 FROM barber_day_closures dc
     WHERE dc.barber_id=p_barber_id AND dc.local_date=p_date AND dc.is_closed)
     AND ((e.barber_id IS NOT NULL AND NOT e.is_closed)
          OR (e.barber_id IS NULL AND h.barber_id IS NOT NULL))
 $body$
 $function$;
 INSERT INTO ustara_schema_migrations(version) VALUES('20261216_safe_day_close');
END $$;
COMMIT;
