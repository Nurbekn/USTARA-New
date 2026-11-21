-- Apply after security_01_login_protection; never executed by app startup.
-- Separate password-reset state and per-account JWT revocation; no changes to
-- users/profile definitions, registration state or the ten-table OTP manifest.
-- Standalone maintenance-window apply, error-stopping runner, concurrent DDL
-- stopped; same schema advisory-lock contract as earlier migrations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_security_02_password_reset';
  table_names CONSTANT TEXT[] := ARRAY['account_session_versions','password_reset_limits',
    'password_reset_requests','password_reset_events'];
  prerequisites CONSTANT TEXT[] := ARRAY['20261113_00_users_foundation','20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts','20261114_security_01_login_protection'];
  object_name TEXT;
  table_oid OID;
  tracking_oid OID;
  table_signature JSONB;
  manifest JSONB := '{}'::jsonb;
  baseline JSONB;
  already_applied BOOLEAN;
  marker_count INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Password reset migration: invalid active schema';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  tracking_oid := pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name));
  IF tracking_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=tracking_oid AND relkind='r' AND relpersistence<>'t') THEN
    RAISE EXCEPTION 'Password reset migration: tracking table missing/incompatible';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count <> cardinality(prerequisites) THEN RAISE EXCEPTION 'Password reset migration: prerequisites missing'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO already_applied USING version_name;
  IF NOT already_applied THEN
    FOREACH object_name IN ARRAY table_names LOOP
      IF pg_catalog.to_regclass(format('%I.%I',schema_name,object_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'Password reset migration: untracked object % exists',object_name;
      END IF;
    END LOOP;
    -- Referenced account identities cannot change during provisioning. Ordinary
    -- DML is permitted by SUE; this is not a blanket lock against arbitrary DDL.
    EXECUTE format('LOCK TABLE ONLY %I.users IN SHARE UPDATE EXCLUSIVE MODE',schema_name);
    EXECUTE format('LOCK TABLE ONLY %I.admin_accounts IN SHARE UPDATE EXCLUSIVE MODE',schema_name);
    EXECUTE format('CREATE TABLE %I.account_session_versions (
      user_id INTEGER PRIMARY KEY REFERENCES %I.users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version>0)
    )',schema_name,schema_name);
    EXECUTE format('CREATE TABLE %I.password_reset_limits (
      phone VARCHAR(20) PRIMARY KEY CHECK (phone ~ %L),
      send_count INTEGER NOT NULL DEFAULT 0 CHECK (send_count BETWEEN 0 AND 3),
      penalty_level INTEGER NOT NULL DEFAULT 0 CHECK (penalty_level BETWEEN 0 AND 2),
      last_sent_at TIMESTAMPTZ,
      blocked_until TIMESTAMPTZ,
      block_reason TEXT CHECK (block_reason IN (%L,%L)),
      CHECK ((blocked_until IS NULL AND block_reason IS NULL) OR
             (blocked_until IS NOT NULL AND block_reason IS NOT NULL))
    )',schema_name,'^\+[1-9][0-9]{7,14}$','sms_limit','otp_attempts');
    EXECUTE format('CREATE TABLE %I.password_reset_requests (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      phone VARCHAR(20) NOT NULL UNIQUE REFERENCES %I.password_reset_limits(phone),
      user_id INTEGER REFERENCES %I.users(id) ON DELETE CASCADE,
      challenge_token_hash TEXT UNIQUE CHECK (challenge_token_hash ~ %L),
      reset_token_hash TEXT UNIQUE CHECK (reset_token_hash ~ %L),
      otp_hmac_hash TEXT NOT NULL CHECK (otp_hmac_hash ~ %L),
      otp_hmac_key_id VARCHAR(100) NOT NULL CHECK (length(otp_hmac_key_id)>0),
      otp_issuance_nonce TEXT NOT NULL CHECK (otp_issuance_nonce ~ %L),
      otp_sent_at TIMESTAMPTZ NOT NULL,
      otp_expires_at TIMESTAMPTZ NOT NULL,
      challenge_expires_at TIMESTAMPTZ NOT NULL,
      otp_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (otp_failed_attempts BETWEEN 0 AND 5),
      verified_at TIMESTAMPTZ,
      reset_expires_at TIMESTAMPTZ,
      CHECK (otp_expires_at=otp_sent_at+interval %L),
      CHECK (challenge_expires_at=otp_sent_at+interval %L),
      CHECK (verified_at IS NULL OR (verified_at>=otp_sent_at AND verified_at<otp_expires_at)),
      CHECK ((verified_at IS NULL AND reset_expires_at IS NULL AND reset_token_hash IS NULL AND challenge_token_hash IS NOT NULL) OR
             (verified_at IS NOT NULL AND reset_expires_at IS NOT NULL AND reset_token_hash IS NOT NULL AND challenge_token_hash IS NULL
              AND reset_expires_at=verified_at+interval %L))
    )',schema_name,schema_name,schema_name,'^[0-9a-f]{64}$','^[0-9a-f]{64}$','^[0-9a-f]{64}$','^[0-9a-f]{64}$',
      '3 minutes','30 minutes','5 minutes');
    EXECUTE format('CREATE TABLE %I.password_reset_events (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      phone VARCHAR(20) NOT NULL CHECK (phone ~ %L),
      event_type VARCHAR(80) NOT NULL CHECK (length(btrim(event_type))>0),
      occurred_at TIMESTAMPTZ NOT NULL,
      admin_account_id INTEGER REFERENCES %I.admin_accounts(id) ON DELETE RESTRICT,
      reason VARCHAR(500),
      CHECK ((admin_account_id IS NULL AND reason IS NULL) OR
             (admin_account_id IS NOT NULL AND reason IS NOT NULL AND length(btrim(reason))>0))
    )',schema_name,'^\+[1-9][0-9]{7,14}$',schema_name);
    EXECUTE format('CREATE INDEX password_reset_requests_expiry_idx ON %I.password_reset_requests(challenge_expires_at)',schema_name);
    EXECUTE format('CREATE INDEX password_reset_events_phone_time_idx ON %I.password_reset_events(phone,occurred_at)',schema_name);
  END IF;
  FOREACH object_name IN ARRAY table_names LOOP
    table_oid := pg_catalog.to_regclass(format('%I.%I',schema_name,object_name));
    IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=table_oid AND relkind='r' AND relpersistence<>'t') THEN
      RAISE EXCEPTION 'Password reset migration: recorded table % missing/incompatible',object_name;
    END IF;
    EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE',schema_name,object_name);
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid) THEN
      RAISE EXCEPTION 'Password reset migration: inheritance not supported';
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
    manifest := manifest || jsonb_build_object(object_name,table_signature);
  END LOOP;
  table_oid := pg_catalog.to_regclass(format('%I.password_reset_limits',schema_name));
  IF already_applied THEN
    BEGIN baseline := pg_catalog.obj_description(table_oid,'pg_class')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Password reset migration: malformed baseline'; END;
    IF baseline->>'version' IS DISTINCT FROM version_name OR baseline->>'format' IS DISTINCT FROM '1'
       OR baseline->'tables' IS DISTINCT FROM manifest THEN
      RAISE EXCEPTION 'Password reset migration: schema drift; no automatic repair';
    END IF;
    RETURN;
  END IF;
  EXECUTE format('COMMENT ON TABLE %I.password_reset_limits IS %L',schema_name,
    jsonb_build_object('version',version_name,'format','1','tables',manifest)::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
