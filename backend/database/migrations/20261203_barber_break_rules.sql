-- v19: multiple recurring weekday breaks and date-specific break intervals.
-- v18 exceptions and confirmed bookings are preserved; the new unified break
-- function adds to (rather than replaces) the legacy single daily break.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
   RAISE EXCEPTION 'Unsafe schema for recurring break rules';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261202_barber_calendar_exceptions') THEN
   RAISE EXCEPTION 'Recurring breaks require the calendar exception migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261203_barber_break_rules')
    OR pg_catalog.to_regclass('barber_weekly_breaks') IS NOT NULL
    OR pg_catalog.to_regclass('barber_date_breaks') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname='ustara_effective_breaks'
       AND pronamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=schema_name)) THEN
   RAISE EXCEPTION 'Recurring breaks already applied or untracked; inspect schema';
 END IF;
 CREATE TABLE barber_weekly_breaks (
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
   start_time TIME NOT NULL,
   end_time TIME NOT NULL,
   PRIMARY KEY(barber_id,day_of_week,start_time),
   CONSTRAINT weekly_break_interval CHECK (start_time < end_time
     AND EXTRACT(SECOND FROM start_time)=0 AND EXTRACT(SECOND FROM end_time)=0
     AND EXTRACT(MINUTE FROM start_time)::integer % 5=0
     AND EXTRACT(MINUTE FROM end_time)::integer % 5=0)
 );
 CREATE TABLE barber_date_breaks (
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   local_date DATE NOT NULL,
   start_time TIME NOT NULL,
   end_time TIME NOT NULL,
   PRIMARY KEY(barber_id,local_date,start_time),
   CONSTRAINT dated_break_interval CHECK (start_time < end_time
     AND EXTRACT(SECOND FROM start_time)=0 AND EXTRACT(SECOND FROM end_time)=0
     AND EXTRACT(MINUTE FROM start_time)::integer % 5=0
     AND EXTRACT(MINUTE FROM end_time)::integer % 5=0)
 );
 EXECUTE $function$
 CREATE FUNCTION ustara_effective_breaks(p_barber_id INTEGER,p_date DATE)
   RETURNS TABLE(start_time TIME,end_time TIME)
   LANGUAGE SQL STABLE SET search_path FROM CURRENT AS $body$
     SELECT GREATEST(b.start_time,h.start_time) AS start_time,
            LEAST(b.end_time,h.end_time) AS end_time
     FROM ustara_effective_day_schedule(p_barber_id,p_date) h
     CROSS JOIN LATERAL (
       SELECT w.start_time,w.end_time FROM barber_weekly_breaks w
         WHERE w.barber_id=p_barber_id AND w.day_of_week=EXTRACT(DOW FROM p_date)::int
       UNION ALL
       SELECT d.start_time,d.end_time FROM barber_date_breaks d
         WHERE d.barber_id=p_barber_id AND d.local_date=p_date
       UNION ALL
       SELECT e.break_start,e.break_end FROM barber_calendar_exceptions e
         WHERE e.barber_id=p_barber_id AND e.local_date=p_date
           AND e.break_start IS NOT NULL AND NOT e.is_closed
     ) b
     WHERE GREATEST(b.start_time,h.start_time) < LEAST(b.end_time,h.end_time)
     ORDER BY 1,2
   $body$
 $function$;
 INSERT INTO ustara_schema_migrations(version) VALUES ('20261203_barber_break_rules');
END $$;
COMMIT;
