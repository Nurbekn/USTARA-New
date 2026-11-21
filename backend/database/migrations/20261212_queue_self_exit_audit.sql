-- v37: allow truthful audit attribution when the QR guest leaves voluntarily.
-- No existing queue rows, bookings, or historic events are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for queue self-exit';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
  pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations
  WHERE version='20261211_smart_booking_active_entry') THEN
  RAISE EXCEPTION 'Queue self-exit requires v30 active-entry migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261212_queue_self_exit_audit')
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
   WHERE attrelid=pg_catalog.to_regclass('walkin_queue_events') AND attname='actor_source' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'Queue self-exit already applied or untracked';
 END IF;
 ALTER TABLE walkin_queue_events ALTER COLUMN actor_user_id DROP NOT NULL;
 ALTER TABLE walkin_queue_events ADD COLUMN actor_source VARCHAR(12) NOT NULL DEFAULT 'staff';
 ALTER TABLE walkin_queue_events ADD CONSTRAINT walkin_queue_event_actor_source CHECK (
  (actor_source='staff' AND actor_user_id IS NOT NULL) OR
  (actor_source='customer' AND actor_user_id IS NOT NULL AND action='left') OR
  (actor_source='qr_guest' AND actor_user_id IS NULL AND action='left')
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261212_queue_self_exit_audit');
END $$;
COMMIT;
