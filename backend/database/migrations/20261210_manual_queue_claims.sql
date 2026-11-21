-- v29: opt-in account binding for barber-entered (non-QR) walk-in tickets.
-- No account is auto-linked; short-lived claim secrets are SHA-256 only.
-- Forward-only. Never apply to production before real PostgreSQL staging QA.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for manual walk-in claims';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
   pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations
   WHERE version='20261209_smart_booking_confirmation') THEN
  RAISE EXCEPTION 'v29 requires v27 confirmation migration';
 END IF;
 IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261210_manual_queue_claims')
   OR pg_catalog.to_regclass('walkin_manual_claims') IS NOT NULL THEN
  RAISE EXCEPTION 'v29 manual claims migration already applied or untracked';
 END IF;
 CREATE TABLE walkin_manual_claims (
  entry_id BIGINT PRIMARY KEY REFERENCES walkin_queue(id) ON DELETE CASCADE,
  claim_hash CHAR(64) UNIQUE CHECK (claim_hash ~ '^[a-f0-9]{64}$'),
  claim_expires_at TIMESTAMPTZ,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  consent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT walkin_manual_claim_proof CHECK (
   (claim_hash IS NULL AND claim_expires_at IS NULL)
   OR (claim_hash IS NOT NULL AND claim_expires_at IS NOT NULL)),
  CONSTRAINT walkin_manual_consent_valid CHECK ((customer_id IS NULL)=(consent_at IS NULL)),
  CONSTRAINT walkin_manual_no_reusable_secret CHECK (customer_id IS NULL OR claim_hash IS NULL)
 );
 CREATE INDEX walkin_manual_customer_current ON walkin_manual_claims(customer_id,entry_id DESC)
   WHERE consent_at IS NOT NULL;
 INSERT INTO ustara_schema_migrations(version) VALUES('20261210_manual_queue_claims');
END $$;
COMMIT;
