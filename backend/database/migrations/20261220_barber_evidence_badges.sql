-- v162 / decisions 46–48: evidence-backed badge administration.
-- Apply only by an authorized operator after the existing forward migration chain.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe badge migration schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261219_customer_barber_chat') THEN
  RAISE EXCEPTION 'Evidence badges require private chat migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261220_barber_evidence_badges')
    OR pg_catalog.to_regclass('barber_evidence_badges') IS NOT NULL
    OR pg_catalog.to_regclass('barber_badge_audit_events') IS NOT NULL THEN
  RAISE EXCEPTION 'Evidence badges migration already present or partially applied';
 END IF;
 CREATE TABLE barber_evidence_badges (
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   badge_type VARCHAR(24) NOT NULL CHECK (badge_type IN ('identity_checked','experience_checked','portfolio_checked')),
   state VARCHAR(12) NOT NULL CHECK (state IN ('active','revoked')),
   evidence_note VARCHAR(500) NOT NULL CHECK (length(btrim(evidence_note)) BETWEEN 20 AND 500),
   revision INTEGER NOT NULL CHECK (revision > 0),
   changed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
   changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   PRIMARY KEY(barber_id,badge_type)
 );
 CREATE INDEX barber_evidence_badges_public ON barber_evidence_badges(barber_id,badge_type) WHERE state='active';
 -- Immutable audit entries; barber id deliberately not an FK so deletion does
 -- not silently erase the administrative decision trail.
 CREATE TABLE barber_badge_audit_events (
   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   barber_id INTEGER NOT NULL,
   badge_type VARCHAR(24) NOT NULL CHECK (badge_type IN ('identity_checked','experience_checked','portfolio_checked')),
   action VARCHAR(8) NOT NULL CHECK (action IN ('grant','revoke')),
   evidence_note VARCHAR(500) NOT NULL CHECK (length(btrim(evidence_note)) BETWEEN 20 AND 500),
   revision INTEGER NOT NULL CHECK (revision > 0),
   actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
   occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   UNIQUE(barber_id,badge_type,revision)
 );
 CREATE INDEX barber_badge_audit_order ON barber_badge_audit_events(barber_id,occurred_at DESC);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261220_barber_evidence_badges');
END $$;
COMMIT;
