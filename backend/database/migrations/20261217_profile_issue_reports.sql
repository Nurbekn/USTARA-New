-- v128 / #178 #49 #83: profile issue reports and admin-only review.
-- Apply only after earlier migration ledger is verified on a disposable test DB.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name text := pg_catalog.current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe schema for profile issue reports';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261118_social_portfolio_reviews') THEN
  RAISE EXCEPTION 'Profile issue reporting requires social migration';
 END IF;
 IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261217_profile_issue_reports')
 OR pg_catalog.to_regclass('profile_issue_reports') IS NOT NULL THEN
  RAISE EXCEPTION 'Profile report migration already applied or partially present';
 END IF;
 CREATE TABLE profile_issue_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(20) NOT NULL CHECK(reason IN('address','hours','services','media','other')),
  details VARCHAR(500) NOT NULL CHECK(length(btrim(details)) BETWEEN 10 AND 500),
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(status IN('pending','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE SET NULL,
  CONSTRAINT profile_issue_review_consistency CHECK (
    (status='pending' AND reviewed_at IS NULL AND reviewed_by_admin_id IS NULL) OR
    (status<>'pending' AND reviewed_at IS NOT NULL)
  )
 );
 CREATE UNIQUE INDEX profile_issue_one_pending_per_reason
  ON profile_issue_reports(barber_id,reporter_user_id,reason) WHERE status='pending';
 CREATE INDEX profile_issue_review_queue ON profile_issue_reports(status,created_at DESC,id DESC);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261217_profile_issue_reports');
END $$;
COMMIT;
