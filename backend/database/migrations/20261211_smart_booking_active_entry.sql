-- v30: one active Smart Booking invitation per walk-in queue entry, including
-- the 2-minute accepted (not yet confirmed) grace period. Forward-only.
-- Dirty legacy data is rejected, never silently deleted or auto-resolved.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for Smart Booking active-entry migration';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations
   WHERE version='20261210_manual_queue_claims') THEN
  RAISE EXCEPTION 'v30 requires v29 manual claims migration';
 END IF;
 IF EXISTS (SELECT 1 FROM ustara_schema_migrations
   WHERE version='20261211_smart_booking_active_entry')
   OR pg_catalog.to_regclass('smart_booking_one_active_entry') IS NOT NULL THEN
  RAISE EXCEPTION 'v30 active-entry protection already applied or untracked';
 END IF;
 -- Block concurrent writers until the duplicate check and index creation finish.
 LOCK TABLE smart_booking_offers IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS (
  SELECT 1 FROM smart_booking_offers
  WHERE status IN ('pending','accepted')
  GROUP BY entry_id HAVING count(*) > 1
 ) THEN
  RAISE EXCEPTION 'Multiple active offers per entry: resolve in staging before v30';
 END IF;
 CREATE UNIQUE INDEX smart_booking_one_active_entry ON smart_booking_offers(entry_id)
  WHERE status IN ('pending','accepted');
 INSERT INTO ustara_schema_migrations(version) VALUES('20261211_smart_booking_active_entry');
END $$;
COMMIT;
