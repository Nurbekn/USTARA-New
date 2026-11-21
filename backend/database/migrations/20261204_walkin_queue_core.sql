-- v21 / stage 4: barber-entered walk-in queue, FIFO and append-only audit.
-- This is NOT QR check-in, an automatic free-slot assignment, or a customer booking.
-- Forward-only: no existing bookings, calendar rows or accounts are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
   RAISE EXCEPTION 'Unsafe schema for walk-in queue';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261203_barber_break_rules') THEN
   RAISE EXCEPTION 'Walk-in queue requires break rules migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261204_walkin_queue_core')
   OR pg_catalog.to_regclass('walkin_queue') IS NOT NULL
   OR pg_catalog.to_regclass('walkin_queue_events') IS NOT NULL THEN
   RAISE EXCEPTION 'Walk-in queue already applied or untracked; inspect schema';
 END IF;
 CREATE TABLE walkin_queue (
   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   request_key CHAR(32) NOT NULL CHECK (request_key ~ '^[0-9a-f]{32}$'),
   display_label VARCHAR(60) NOT NULL CHECK (length(btrim(display_label)) BETWEEN 1 AND 60),
   queue_date DATE NOT NULL DEFAULT (pg_catalog.timezone('Asia/Tashkent',pg_catalog.clock_timestamp())::date),
   status VARCHAR(12) NOT NULL DEFAULT 'waiting'
     CHECK (status IN ('waiting','called','served','missed','left')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   called_at TIMESTAMPTZ,
   finished_at TIMESTAMPTZ,
   CONSTRAINT walkin_queue_state_dates CHECK (
      (status='waiting' AND called_at IS NULL AND finished_at IS NULL) OR
      (status='called' AND called_at IS NOT NULL AND finished_at IS NULL) OR
      (status IN ('served','missed') AND called_at IS NOT NULL AND finished_at IS NOT NULL) OR
      (status='left' AND finished_at IS NOT NULL)
   ),
   CONSTRAINT walkin_queue_request_unique UNIQUE(barber_id,request_key)
 );
 CREATE UNIQUE INDEX walkin_queue_one_called_per_day
   ON walkin_queue(barber_id,queue_date) WHERE status='called';
 CREATE INDEX walkin_queue_fifo ON walkin_queue(barber_id,queue_date,id)
   WHERE status='waiting';
 CREATE INDEX walkin_queue_active ON walkin_queue(barber_id,id)
   WHERE status IN ('waiting','called');
 CREATE TABLE walkin_queue_events (
   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   entry_id BIGINT NOT NULL REFERENCES walkin_queue(id) ON DELETE CASCADE,
   actor_user_id INTEGER NOT NULL REFERENCES users(id),
   action VARCHAR(12) NOT NULL CHECK (action IN ('joined','called','served','missed','left')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX walkin_queue_events_entry ON walkin_queue_events(entry_id,id);
 INSERT INTO ustara_schema_migrations(version) VALUES ('20261204_walkin_queue_core');
END $$;
COMMIT;
