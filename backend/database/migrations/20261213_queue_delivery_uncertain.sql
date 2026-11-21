-- v39: a sent queue call may be unknown after crash/network timeout.
-- Keep ambiguous delivery out of the automatic retry path; preserve all rows.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for queue delivery migration';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
  pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261212_queue_self_exit_audit') THEN
  RAISE EXCEPTION 'Queue delivery requires v37 self-exit migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261213_queue_delivery_uncertain')
   OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue_notification_outbox')
      AND conname='walkin_queue_notification_delivery_status') THEN
  RAISE EXCEPTION 'Queue delivery uncertainty migration already applied or untracked';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid=pg_catalog.to_regclass('walkin_queue_notification_outbox')
     AND conname='walkin_queue_notification_outbox_status_check'
     AND contype='c' AND convalidated) THEN
  RAISE EXCEPTION 'Original queue outbox status constraint missing or modified';
 END IF;
 ALTER TABLE walkin_queue_notification_outbox
  DROP CONSTRAINT walkin_queue_notification_outbox_status_check;
 ALTER TABLE walkin_queue_notification_outbox
  ADD CONSTRAINT walkin_queue_notification_delivery_status
  CHECK(status IN ('pending','processing','sent','failed','cancelled','uncertain'));
 INSERT INTO ustara_schema_migrations(version) VALUES('20261213_queue_delivery_uncertain');
END $$;
COMMIT;
