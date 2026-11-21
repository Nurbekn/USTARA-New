-- Login-only protection; independent of registration/OTP limit and audit tables.
-- Apply before deploying protected login handlers. This file never runs at app startup.
-- Standalone maintenance-window migration; other DDL must be stopped/drained and
-- cooperating DDL must use the existing ustara-schema-ddl advisory-lock contract.
-- Tracking is locked first. Rerun validates its own catalog signature, never repairs.
-- The OTP manifest covers its original ten tables: no covered definition/comment
-- is changed here. Adding this independent table does not rewrite OTP archives.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_security_01_login_protection';
  prerequisites CONSTANT TEXT[] := ARRAY['20261113_00_users_foundation',
    '20261113_unified_accounts','20261113_unified_accounts_02_admin_accounts'];
  tracking_oid OID;
  table_oid OID;
  table_signature JSONB;
  baseline JSONB;
  already_applied BOOLEAN;
  marker_count INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Login protection migration: invalid active schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  tracking_oid := pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name));
  IF tracking_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=tracking_oid AND relkind='r' AND relpersistence<>'t') THEN
    RAISE EXCEPTION 'Login protection migration: tracking table missing/incompatible';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count <> cardinality(prerequisites) THEN
    RAISE EXCEPTION 'Login protection migration: prerequisite markers missing';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO already_applied USING version_name;
  table_oid := pg_catalog.to_regclass(format('%I.login_attempt_limits',schema_name));
  IF NOT already_applied THEN
    IF table_oid IS NOT NULL THEN
      RAISE EXCEPTION 'Login protection migration: untracked login_attempt_limits exists';
    END IF;
    EXECUTE format('CREATE TABLE %I.login_attempt_limits (
      scope TEXT NOT NULL CHECK (scope IN (%L,%L)),
      kind TEXT NOT NULL CHECK (kind IN (%L,%L)),
      key_hash TEXT NOT NULL CHECK (key_hash ~ %L),
      failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
      penalty_level INTEGER NOT NULL DEFAULT 0 CHECK (penalty_level >= 0),
      window_started_at TIMESTAMPTZ,
      last_failed_at TIMESTAMPTZ,
      blocked_until TIMESTAMPTZ,
      PRIMARY KEY(scope,kind,key_hash),
      CHECK ((kind=%L AND failed_count<3 AND penalty_level<=4) OR
             (kind=%L AND failed_count<10 AND penalty_level<=3)),
      CHECK ((failed_count=0 AND window_started_at IS NULL) OR
             (failed_count>0 AND window_started_at IS NOT NULL AND last_failed_at IS NOT NULL)),
      CHECK (window_started_at IS NULL OR window_started_at<=last_failed_at),
      CHECK (blocked_until IS NULL OR (last_failed_at IS NOT NULL AND blocked_until>last_failed_at))
    )',schema_name,'public','admin','account','ip','^[0-9a-f]{64}$','account','ip');
    EXECUTE format('CREATE INDEX login_attempt_limits_cleanup_idx ON %I.login_attempt_limits(last_failed_at)',schema_name);
    table_oid := pg_catalog.to_regclass(format('%I.login_attempt_limits',schema_name));
  END IF;
  IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=table_oid AND relkind='r' AND relpersistence<>'t') THEN
    RAISE EXCEPTION 'Login protection migration: recorded table missing/incompatible';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.login_attempt_limits IN ACCESS EXCLUSIVE MODE',schema_name);
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid) THEN
    RAISE EXCEPTION 'Login protection migration: inheritance is not supported';
  END IF;
    SELECT jsonb_build_object(
      'table', jsonb_build_object(
        'kind', c.relkind, 'persistence', c.relpersistence,
        'row_security', c.relrowsecurity, 'force_row_security', c.relforcerowsecurity,
        'options', c.reloptions
      ),
      'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', a.attname, 'position', a.attnum,
        'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
        'identity', a.attidentity, 'generated', a.attgenerated,
        'collation', CASE WHEN a.attcollation=0 THEN NULL
                          ELSE a.attcollation::regcollation::text END,
        'default', pg_get_expr(d.adbin, d.adrelid)
      ) ORDER BY a.attnum), '[]'::jsonb)
        FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', k.conname, 'type', k.contype,
        'definition', pg_get_constraintdef(k.oid, false),
        'validated', k.convalidated, 'deferrable', k.condeferrable,
        'deferred', k.condeferred
      ) ORDER BY k.conname), '[]'::jsonb)
        FROM pg_catalog.pg_constraint k WHERE k.conrelid=table_oid),
      'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid),
        'unique', i.indisunique, 'primary', i.indisprimary,
        'valid', i.indisvalid, 'ready', i.indisready,
        'live', i.indislive, 'exclusion', i.indisexclusion,
        'options', ic.reloptions
      ) ORDER BY ic.relname), '[]'::jsonb)
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid=table_oid)
    ) INTO table_signature FROM pg_catalog.pg_class c WHERE c.oid=table_oid;
  IF already_applied THEN
    BEGIN
      baseline := pg_catalog.obj_description(table_oid,'pg_class')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Login protection migration: malformed baseline';
    END;
    IF baseline->>'version' IS DISTINCT FROM version_name
       OR baseline->>'format' IS DISTINCT FROM '1'
       OR baseline->'signature' IS DISTINCT FROM table_signature THEN
      RAISE EXCEPTION 'Login protection migration: schema drift; no automatic repair';
    END IF;
    RETURN;
  END IF;
  EXECUTE format('COMMENT ON TABLE %I.login_attempt_limits IS %L',schema_name,
    jsonb_build_object('version',version_name,'format','1','signature',table_signature)::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
