-- v96 / #23: explicit arrival check-in between call and service start.
-- Forward-only additive schema; existing ticket data remains untouched.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for walk-in arrival';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations
   WHERE version='20261214_walkin_service_started') THEN
  RAISE EXCEPTION 'Arrival requires the service-start migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations
     WHERE version='20261215_walkin_arrived')
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
     WHERE attrelid=pg_catalog.to_regclass('walkin_queue') AND attname='arrived_at' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Arrival migration already applied or untracked';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue') AND conname='walkin_queue_state_dates'
    AND contype='c' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue_events')
      AND conname='walkin_queue_events_action_check' AND contype='c' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE
    oid=pg_catalog.to_regclass('walkin_queue_one_called_per_day') AND relkind='i') THEN
  RAISE EXCEPTION 'Queue schema prerequisites missing';
 END IF;
 ALTER TABLE walkin_queue ADD COLUMN arrived_at TIMESTAMPTZ;
 ALTER TABLE walkin_queue DROP CONSTRAINT walkin_queue_status_check;
 ALTER TABLE walkin_queue ADD CONSTRAINT walkin_queue_status_check
   CHECK(status IN ('waiting','called','arrived','in_service','served','missed','left'));
 ALTER TABLE walkin_queue DROP CONSTRAINT walkin_queue_state_dates;
 ALTER TABLE walkin_queue ADD CONSTRAINT walkin_queue_state_dates CHECK(
   (status='waiting' AND called_at IS NULL AND arrived_at IS NULL AND started_at IS NULL AND finished_at IS NULL) OR
   (status='called' AND called_at IS NOT NULL AND arrived_at IS NULL AND started_at IS NULL AND finished_at IS NULL) OR
   (status='arrived' AND called_at IS NOT NULL AND arrived_at IS NOT NULL AND started_at IS NULL
       AND finished_at IS NULL AND called_at<=arrived_at) OR
   (status='in_service' AND called_at IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NULL
       AND (arrived_at IS NULL OR (called_at<=arrived_at AND arrived_at<=started_at))) OR
   (status='served' AND called_at IS NOT NULL AND finished_at IS NOT NULL
       AND (started_at IS NULL OR started_at<=finished_at)
       AND (arrived_at IS NULL OR (called_at<=arrived_at AND started_at IS NOT NULL AND arrived_at<=started_at))) OR
   (status='missed' AND called_at IS NOT NULL AND arrived_at IS NULL AND started_at IS NULL AND finished_at IS NOT NULL) OR
   (status='left' AND started_at IS NULL AND finished_at IS NOT NULL
       AND (arrived_at IS NULL OR (called_at IS NOT NULL AND called_at<=arrived_at AND arrived_at<=finished_at)))
 );
 ALTER TABLE walkin_queue_events DROP CONSTRAINT walkin_queue_events_action_check;
 ALTER TABLE walkin_queue_events ADD CONSTRAINT walkin_queue_events_action_check
    CHECK(action IN ('joined','called','arrived','started','served','missed','left'));
 DROP INDEX walkin_queue_one_called_per_day;
 CREATE UNIQUE INDEX walkin_queue_one_called_per_day ON walkin_queue(barber_id,queue_date)
    WHERE status IN ('called','arrived','in_service');
 DROP INDEX walkin_queue_active;
 CREATE INDEX walkin_queue_active ON walkin_queue(barber_id,id)
    WHERE status IN ('waiting','called','arrived','in_service');
 INSERT INTO ustara_schema_migrations(version) VALUES('20261215_walkin_arrived');
END $$;
COMMIT;
