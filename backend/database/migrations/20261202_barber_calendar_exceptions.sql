-- Calendar exceptions: date-specific closure/vacation, special hours and one break.
-- Does not alter/cancel existing bookings. Application changes are conflict checked.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
   RAISE EXCEPTION 'Unsafe schema for calendar exceptions';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261201_cancellation_policy') THEN
   RAISE EXCEPTION 'Calendar exceptions require cancellation policy migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261202_barber_calendar_exceptions')
    OR pg_catalog.to_regclass('barber_calendar_exceptions') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname='ustara_effective_day_schedule'
      AND pronamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=schema_name)) THEN
   RAISE EXCEPTION 'Calendar exceptions already applied or untracked; inspect schema';
 END IF;
 CREATE TABLE barber_calendar_exceptions (
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   local_date DATE NOT NULL,
   is_closed BOOLEAN NOT NULL,
   start_time TIME,
   end_time TIME,
   break_start TIME,
   break_end TIME,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   PRIMARY KEY (barber_id,local_date),
   CONSTRAINT barber_calendar_exception_values CHECK (
      (is_closed AND start_time IS NULL AND end_time IS NULL AND break_start IS NULL AND break_end IS NULL)
      OR (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL
          AND start_time < end_time AND
          ((break_start IS NULL AND break_end IS NULL) OR
           (break_start IS NOT NULL AND break_end IS NOT NULL
            AND break_start >= start_time AND break_start < break_end AND break_end <= end_time)))
   )
 );
 EXECUTE $function$
   CREATE FUNCTION ustara_effective_day_schedule(p_barber_id INTEGER,p_date DATE)
     RETURNS TABLE(start_time TIME,end_time TIME,break_start TIME,break_end TIME)
     LANGUAGE SQL STABLE SET search_path FROM CURRENT AS $body$
       SELECT CASE WHEN e.barber_id IS NOT NULL THEN e.start_time ELSE h.start_time END,
              CASE WHEN e.barber_id IS NOT NULL THEN e.end_time ELSE h.end_time END,
              e.break_start,e.break_end
       FROM (SELECT 1) seed
       LEFT JOIN barber_working_hours h ON h.barber_id=p_barber_id AND h.day_of_week=EXTRACT(DOW FROM p_date)::int
       LEFT JOIN barber_calendar_exceptions e ON e.barber_id=p_barber_id AND e.local_date=p_date
       WHERE (e.barber_id IS NOT NULL AND NOT e.is_closed)
         OR (e.barber_id IS NULL AND h.barber_id IS NOT NULL)
     $body$
 $function$;
 INSERT INTO ustara_schema_migrations(version) VALUES('20261202_barber_calendar_exceptions');
END $$;
COMMIT;
