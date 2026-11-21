-- v22: one-use walk-in QR check-in, staff approval and immutable decision audit.
-- No existing queue/booking data is rewritten. Apply only after v21 on a reviewed database.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for QR migration';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261204_walkin_queue_core') THEN
  RAISE EXCEPTION 'Walk-in QR requires v21 queue migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261205_walkin_qr_approval')
   OR pg_catalog.to_regclass('walkin_qr_tokens') IS NOT NULL
   OR pg_catalog.to_regclass('walkin_qr_requests') IS NOT NULL
   OR pg_catalog.to_regclass('walkin_qr_request_events') IS NOT NULL THEN
  RAISE EXCEPTION 'QR migration already applied or untracked';
 END IF;
 CREATE TABLE walkin_qr_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  CONSTRAINT qr_token_expiry CHECK (expires_at>created_at)
 );
 CREATE INDEX walkin_qr_tokens_active ON walkin_qr_tokens(barber_id,expires_at DESC)
  WHERE used_at IS NULL;
 CREATE TABLE walkin_qr_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_token_id BIGINT NOT NULL UNIQUE REFERENCES walkin_qr_tokens(id) ON DELETE CASCADE,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request_key CHAR(32) NOT NULL CHECK (request_key ~ '^[a-f0-9]{32}$'),
  display_label VARCHAR(60) NOT NULL CHECK (length(btrim(display_label)) BETWEEN 1 AND 60),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  queue_entry_id BIGINT UNIQUE REFERENCES walkin_queue(id) ON DELETE CASCADE,
  decided_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT qr_decision_consistency CHECK (
   (status='pending' AND queue_entry_id IS NULL AND decided_at IS NULL AND decided_by_user_id IS NULL) OR
   (status='approved' AND queue_entry_id IS NOT NULL AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL) OR
   (status='rejected' AND queue_entry_id IS NULL AND decided_at IS NOT NULL AND decided_by_user_id IS NOT NULL)
  )
 );
 CREATE INDEX walkin_qr_pending ON walkin_qr_requests(barber_id,created_at,id) WHERE status='pending';
 CREATE TABLE walkin_qr_request_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES walkin_qr_requests(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id),
  action VARCHAR(12) NOT NULL CHECK(action IN ('requested','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
 );
 CREATE INDEX walkin_qr_request_event_log ON walkin_qr_request_events(request_id,id);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261205_walkin_qr_approval');
END $$;
COMMIT;
