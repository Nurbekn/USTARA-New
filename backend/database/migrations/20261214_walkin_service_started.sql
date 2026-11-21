-- v95 / #23: explicit "service started" stage for walk-in tickets.
-- FORWARD ONLY. Historical queue rows, events and appointments are not rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for walk-in service start';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
  pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations
  WHERE version='20261213_queue_delivery_uncertain') THEN
  RAISE EXCEPTION 'Service start requires v39 queue delivery migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations
    WHERE version='20261214_walkin_service_started')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid=pg_catalog.to_regclass('walkin_queue')
        AND attname='started_at' AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Service start migration already applied or untracked';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue')
      AND conname='walkin_queue_status_check' AND contype='c' AND convalidated)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue')
      AND conname='walkin_queue_state_dates' AND contype='c' AND convalidated)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue_events')
      AND conname='walkin_queue_events_action_check' AND contype='c' AND convalidated)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=pg_catalog.to_regclass('walkin_queue_one_called_per_day') AND relkind='i') THEN
   RAISE EXCEPTION 'Original queue schema constraints/index missing; manual review required';
 END IF;
 ALTER TABLE walkin_queue ADD COLUMN started_at TIMESTAMPTZ;
 ALTER TABLE walkin_queue DROP CONSTRAINT walkin_queue_status_check;
 ALTER TABLE walkin_queue ADD CONSTRAINT walkin_queue_status_check
   CHECK(status IN ('waiting','called','in_service','served','missed','left'));
 ALTER TABLE walkin_queue DROP CONSTRAINT walkin_queue_state_dates;
 ALTER TABLE walkin_queue ADD CONSTRAINT walkin_queue_state_dates CHECK(
    (status='waiting' AND called_at IS NULL AND started_at IS NULL AND finished_at IS NULL) OR
    (status='called' AND called_at IS NOT NULL AND started_at IS NULL AND finished_at IS NULL) OR
    (status='in_service' AND called_at IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NULL) OR
    (status='served' AND called_at IS NOT NULL AND finished_at IS NOT NULL
      AND (started_at IS NULL OR started_at<=finished_at)) OR
    (status='missed' AND called_at IS NOT NULL AND started_at IS NULL AND finished_at IS NOT NULL) OR
    (status='left' AND started_at IS NULL AND finished_at IS NOT NULL)
 );
 ALTER TABLE walkin_queue_events DROP CONSTRAINT walkin_queue_events_action_check;
 ALTER TABLE walkin_queue_events ADD CONSTRAINT walkin_queue_events_action_check
   CHECK(action IN ('joined','called','started','served','missed','left'));
 -- Prevent a second call while another ticket is being served.
 DROP INDEX walkin_queue_one_called_per_day;
 CREATE UNIQUE INDEX walkin_queue_one_called_per_day ON walkin_queue(barber_id,queue_date)
   WHERE status IN ('called','in_service');
 DROP INDEX walkin_queue_active;
 CREATE INDEX walkin_queue_active ON walkin_queue(barber_id,id)
   WHERE status IN ('waiting','called','in_service');
 INSERT INTO ustara_schema_migrations(version) VALUES('20261214_walkin_service_started');
END $$;
COMMIT;
