-- OTP registration storage only. Does not send SMS or create accounts.
-- Prerequisites: all three 20261113 account migrations, in their documented order.
-- Hash contract: OTP = HMAC-SHA-256, lowercase hex; token = SHA-256 of a
-- cryptographically random high-entropy token, lowercase hex. Keep all keys,
-- raw OTPs, raw passwords and raw tokens OUT of this database and JSON metadata.
-- A database CHECK can validate encoding, not prove that a value was hashed.
-- HMAC key IDs are non-secret identifiers; retain old keys while needed.
--
-- Service contract (not implemented by this migration):
-- * Normalize registration phones to E.164; existing users.phone is untouched.
-- * Lock the phone-limit row, then pending row, consistently in every writer.
-- * Initial send counts as 1. Allow 3 sends; on request 4 set send_count=3,
--   penalty_level=1, blocked_at=now(), blocked_until=now()+1 hour,
--   block_reason='sms_limit'. After expiry reset send_count to 0 and clear
--   block fields, retaining penalty_level. Next violation sets level 2 and
--   a 5-hour block. Further violations remain level 2 / 5 hours.
-- * Admin unblock MUST use one client and ONE transaction, with one timestamp:
--   BEGIN; validate active admin; lock phone-limit row then pending FOR UPDATE;
--   reset send_count=0, penalty_level=0, last_sent_at=NULL, blocked_at=NULL,
--   block_reason=NULL, blocked_until=NULL; set admin_unblocked_at and updated_at;
--   mark retained OTP history rows invalidated (reason admin_unblocked), preserving
--   previous invalidation reasons; DELETE the pending row (do not just unverify);
--   INSERT registration_admin_actions(action_type='unblock', actor, reason) AND
--   registration_security_events(event_type='admin_unblocked'); COMMIT.
--   Any failure MUST roll back ALL steps. Do not delete OTP/security/admin history.
--   Every verify/resend/complete/start writer MUST use the same lock order and
--   re-read current pending state after locking. History is NEVER an auth source.
--   New registration uses a fresh random session token and OTP issuance nonce;
--   never restore an old token/hash from history. Unblock cannot revoke a user
--   account login token; it only revokes this pending registration's credentials.
--   This restores a fresh registration budget but NEVER bypasses users.phone
--   uniqueness. Do not remove histories or the phone-limit row to reset state.
-- * Resend replaces the current OTP hash and appends a history row in the same
--   transaction; mark the previous history row superseded. OTP TTL is exactly
--   3 minutes. Session TTL is independent, so expired OTP does not erase password.
-- * Verify must reject expired sessions/OTPs and >=5 failed attempts. Resend
--   requires >=180 seconds since last_sent_at and is forbidden after verification.
--   Successful verification atomically sets phone_verified_at and
--   completion_expires_at = phone_verified_at + INTERVAL '15 minutes'.
--   session_expires_at is the PRE-verification registration credential deadline;
--   after verification, complete uses completion_expires_at instead, so an
--   original session deadline cannot truncate the promised 15-minute window.
--   Complete requires verified state and server time < completion_expires_at;
--   repeat verify must not extend that deadline. Failed verification changes
--   neither phone_verified_at nor completion_expires_at. Both remain NULL until success.
-- * Verify and complete must enforce expiry using server time and row locks.
--   Verification failures must commit their attempt counters, even on HTTP errors.
-- * Complete inserts users + profile and deletes pending in ONE transaction.
-- * updated_at, history and audit writes are explicit service responsibilities.
-- * JSON metadata must use an application allowlist of non-secret fields.
-- * No automatic cleanup/cascading deletion of OTP or security histories.
--
-- Rollback plan (documentation ONLY, deliberately no executable down migration):
-- 1. Disable OTP writers and roll application back to a compatible version.
-- 2. Prefer retaining these additive tables/columns and the migration marker;
--    this preserves all pending data, names and audit/history records.
-- 3. A structural down migration requires a separately reviewed, verified archive
--    of all five tables AND first_name/last_name data, plus dependency checks.
--    Only then consider dropping new indexes/tables in reverse dependency order
--    (admin actions, security events, OTP history, pending, phone limits), and
--    the four new profile columns, with RESTRICT, NEVER CASCADE. Remove only
--    this version's marker after that succeeds. Do not change existing name,
--    users, admin_accounts or any existing profile rows. Do not run the old
--    admin rollback while this migration's admin-action FK still exists.

BEGIN;

DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261114_otp_registration';
  object_name TEXT;
  table_oid OID;
  already_applied BOOLEAN;
  expected_manifest JSONB;
  actual_manifest JSONB := '{}'::jsonb;
  table_signature JSONB;
  category TEXT;
  manifest_comment TEXT;
  mismatch_name TEXT;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog', 'information_schema') THEN
    RAISE EXCEPTION 'OTP migration: invalid active schema';
  END IF;
  -- Avoid resolving account tables in a different schema via search_path.
  PERFORM set_config('search_path', format('%I, pg_catalog', schema_name), true);
  FOREACH object_name IN ARRAY ARRAY[
    'users', 'customers', 'barbers', 'admin_accounts', 'ustara_schema_migrations'
  ] LOOP
    table_oid := to_regclass(format('%I.%I', schema_name, object_name));
    IF table_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r'
    ) THEN
      RAISE EXCEPTION 'OTP migration: prerequisite table % missing or incompatible', object_name;
    END IF;
  END LOOP;

  -- Serialize migration reruns, without modifying prerequisite rows.
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF (SELECT count(*) FROM ustara_schema_migrations WHERE version IN (
    '20261113_00_users_foundation', '20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts'
  )) <> 3 THEN
    RAISE EXCEPTION 'OTP migration: prerequisite migration markers missing';
  END IF;
  SELECT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version=version_name)
    INTO already_applied;

  FOREACH object_name IN ARRAY ARRAY[
    'registration_phone_limits', 'pending_registrations',
    'registration_otp_history', 'registration_security_events',
    'registration_admin_actions'
  ] LOOP
    table_oid := to_regclass(format('%I.%I', schema_name, object_name));
    IF already_applied THEN
      IF table_oid IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_class WHERE oid=table_oid AND relkind='r'
      ) THEN
        RAISE EXCEPTION 'OTP migration: recorded migration has missing/incompatible table %', object_name;
      END IF;
    ELSIF table_oid IS NOT NULL THEN
      -- Never adopt unknown pre-existing objects with IF NOT EXISTS.
      RAISE EXCEPTION 'OTP migration: untracked object % already exists', object_name;
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY ARRAY['customers', 'barbers'] LOOP
    table_oid := to_regclass(format('%I.%I', schema_name, object_name));
    IF already_applied THEN
      IF (SELECT count(*) FROM pg_attribute WHERE attrelid=table_oid
          AND attname IN ('first_name','last_name') AND NOT attisdropped
          AND atttypid='character varying'::regtype AND atttypmod=84
          AND NOT attnotnull AND attgenerated='' AND attidentity='') <> 2 THEN
        RAISE EXCEPTION 'OTP migration: recorded profile columns incompatible in %', object_name;
      END IF;
    ELSIF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=table_oid
                 AND attname IN ('first_name','last_name') AND NOT attisdropped) THEN
      RAISE EXCEPTION 'OTP migration: untracked profile columns in %', object_name;
    END IF;
  END LOOP;
  IF NOT already_applied THEN
  CREATE TABLE registration_phone_limits (
    phone VARCHAR(20) PRIMARY KEY CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    send_count SMALLINT NOT NULL DEFAULT 0 CHECK (send_count BETWEEN 0 AND 3),
    penalty_level SMALLINT NOT NULL DEFAULT 0 CHECK (penalty_level BETWEEN 0 AND 2),
    last_sent_at TIMESTAMPTZ,
    blocked_at TIMESTAMPTZ,
    block_reason TEXT,
    blocked_until TIMESTAMPTZ,
    admin_unblocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT registration_phone_limits_block_check CHECK (
      (blocked_at IS NULL AND block_reason IS NULL AND blocked_until IS NULL)
      OR (blocked_at IS NOT NULL AND block_reason IS NOT NULL
          AND length(btrim(block_reason)) > 0
          AND blocked_until IS NOT NULL AND blocked_until > blocked_at)
    )
    -- Effective block status is blocked_until > server time, NOT a stored bool.
    -- Expired block fields are cleared by the service on the next locked request.
  );

  CREATE TABLE pending_registrations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone VARCHAR(20) NOT NULL UNIQUE REFERENCES registration_phone_limits(phone)
      ON DELETE RESTRICT,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer','barber')),
    password_hash VARCHAR(255) NOT NULL CHECK (
      password_hash ~ '^(ustara-sha256-bcrypt:)?\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
    ),
    otp_hmac_hash TEXT NOT NULL CHECK (otp_hmac_hash ~ '^[0-9a-f]{64}$'),
    otp_hmac_key_id VARCHAR(100) NOT NULL CHECK (length(btrim(otp_hmac_key_id)) > 0),
    otp_issuance_nonce TEXT NOT NULL UNIQUE CHECK (otp_issuance_nonce ~ '^[0-9a-f]{64}$'),
    otp_sent_at TIMESTAMPTZ NOT NULL,
    otp_expires_at TIMESTAMPTZ NOT NULL,
    otp_failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (otp_failed_attempts >= 0),
    phone_verified_at TIMESTAMPTZ,
    completion_expires_at TIMESTAMPTZ,
    session_token_hash TEXT NOT NULL UNIQUE CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
    session_expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pending_registrations_otp_ttl_check
      CHECK (otp_expires_at = otp_sent_at + INTERVAL '3 minutes'),
    CONSTRAINT pending_registrations_session_check
      CHECK (session_expires_at > created_at AND otp_sent_at >= created_at
             AND otp_expires_at <= session_expires_at),
    CONSTRAINT pending_registrations_verified_check CHECK (
      phone_verified_at IS NULL OR
      (phone_verified_at >= otp_sent_at AND phone_verified_at < otp_expires_at)
    ),
    CONSTRAINT pending_registrations_completion_check CHECK (
      (phone_verified_at IS NULL AND completion_expires_at IS NULL)
      OR (phone_verified_at IS NOT NULL AND completion_expires_at IS NOT NULL
          AND completion_expires_at = phone_verified_at + INTERVAL '15 minutes')
    )
  );

  -- No FK to pending: successful registration deletes pending but retains history.
  -- otp_hmac_hash is deliberately NOT unique: the hash input includes issuance
  -- context (phone + registration + random issuance nonce + code), defined by service.
  CREATE TABLE registration_otp_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    registration_id BIGINT NOT NULL CHECK (registration_id > 0),
    issuance_nonce TEXT NOT NULL UNIQUE CHECK (issuance_nonce ~ '^[0-9a-f]{64}$'),
    otp_hmac_hash TEXT NOT NULL CHECK (otp_hmac_hash ~ '^[0-9a-f]{64}$'),
    otp_hmac_key_id VARCHAR(100) NOT NULL CHECK (length(btrim(otp_hmac_key_id)) > 0),
    sent_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at = sent_at + INTERVAL '3 minutes'),
    verified_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    invalidation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (verified_at IS NULL OR (verified_at >= sent_at AND verified_at < expires_at)),
    CHECK ((invalidated_at IS NULL AND invalidation_reason IS NULL) OR
           (invalidated_at IS NOT NULL AND invalidated_at >= sent_at
            AND invalidation_reason IS NOT NULL AND length(btrim(invalidation_reason)) > 0))
  );

  CREATE TABLE registration_security_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    event_type VARCHAR(80) NOT NULL CHECK (length(btrim(event_type)) > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
    -- Suggested types: otp_sent, otp_rejected, otp_expired, phone_verified,
    -- sms_limit_blocked, admin_blocked, admin_unblocked, registration_completed.
    -- No phone/pending FK: cleanup must not destroy or prevent retaining history.
  );

  CREATE TABLE registration_admin_actions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_account_id INTEGER NOT NULL REFERENCES admin_accounts(id) ON DELETE RESTRICT,
    phone VARCHAR(20) NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    action_type VARCHAR(80) NOT NULL CHECK (length(btrim(action_type)) > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object')
    -- Actor is admin_accounts.id, never users.id. Service checks is_active.
    -- Suggested actions: block, unblock. No cascading audit deletion.
  );

  ALTER TABLE customers ADD COLUMN first_name VARCHAR(80), ADD COLUMN last_name VARCHAR(80);
  ALTER TABLE barbers ADD COLUMN first_name VARCHAR(80), ADD COLUMN last_name VARCHAR(80);

  CREATE INDEX registration_phone_limits_blocked_until_idx
    ON registration_phone_limits(blocked_until) WHERE blocked_until IS NOT NULL;
  CREATE INDEX pending_registrations_session_expiry_idx ON pending_registrations(session_expires_at);
  CREATE INDEX pending_registrations_otp_expiry_idx ON pending_registrations(otp_expires_at);
  CREATE INDEX pending_registrations_completion_expiry_idx
    ON pending_registrations(completion_expires_at) WHERE completion_expires_at IS NOT NULL;
  CREATE INDEX registration_otp_history_phone_time_idx ON registration_otp_history(phone, sent_at DESC, id DESC);
  CREATE INDEX registration_otp_history_registration_idx ON registration_otp_history(registration_id);
  CREATE INDEX registration_security_events_phone_time_idx ON registration_security_events(phone, occurred_at DESC, id DESC);
  CREATE INDEX registration_security_events_time_idx ON registration_security_events(occurred_at DESC, id DESC);
  CREATE INDEX registration_admin_actions_phone_time_idx ON registration_admin_actions(phone, occurred_at DESC, id DESC);
  CREATE INDEX registration_admin_actions_admin_time_idx ON registration_admin_actions(admin_account_id, occurred_at DESC, id DESC);
  CREATE INDEX registration_admin_actions_time_idx ON registration_admin_actions(occurred_at DESC, id DESC);

  END IF; -- first application DDL only

  -- The baseline is captured ONCE from this transaction's freshly created DDL.
  -- Store it as a versioned JSON table comment, not in account rows or a new table.
  -- Reruns compare catalog definitions to this immutable-by-convention baseline;
  -- they NEVER replace the baseline, repair objects, or update the tracking row.
  -- This avoids brittle hand-written pg_get_constraintdef formatting assumptions.
  -- The baseline is an accidental-drift guard, not protection against a privileged
  -- actor modifying both schema and baseline. Keep this table comment intact.
  -- It also covers prerequisite definitions as observed on initial application.
  -- Later intentional migrations require a reviewed compatibility strategy.
  FOREACH object_name IN ARRAY ARRAY[
    'users', 'customers', 'barbers', 'admin_accounts', 'ustara_schema_migrations',
    'registration_phone_limits', 'pending_registrations',
    'registration_otp_history', 'registration_security_events',
    'registration_admin_actions'
  ] LOOP
    -- ACCESS SHARE prevents concurrent ALTER/DROP while allowing normal DML.
    EXECUTE format('LOCK TABLE %I.%I IN ACCESS SHARE MODE', schema_name, object_name);
    table_oid := to_regclass(format('%I.%I', schema_name, object_name));
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
        FROM pg_attribute a LEFT JOIN pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', k.conname, 'type', k.contype,
        'definition', pg_get_constraintdef(k.oid, false),
        'validated', k.convalidated, 'deferrable', k.condeferrable,
        'deferred', k.condeferred
      ) ORDER BY k.conname), '[]'::jsonb)
        FROM pg_constraint k WHERE k.conrelid=table_oid),
      'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid),
        'unique', i.indisunique, 'primary', i.indisprimary,
        'valid', i.indisvalid, 'ready', i.indisready,
        'live', i.indislive, 'exclusion', i.indisexclusion,
        'options', ic.reloptions
      ) ORDER BY ic.relname), '[]'::jsonb)
        FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid=table_oid)
    ) INTO table_signature FROM pg_class c WHERE c.oid=table_oid;
    actual_manifest := actual_manifest || jsonb_build_object(object_name, table_signature);
  END LOOP;

  IF already_applied THEN
    manifest_comment := obj_description(
      to_regclass(format('%I.registration_phone_limits', schema_name)), 'pg_class');
    BEGIN
      expected_manifest := manifest_comment::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'OTP migration: malformed schema baseline comment; manual review required';
    END;
    IF expected_manifest IS NULL
       OR (expected_manifest->>'version') IS DISTINCT FROM version_name
       OR (expected_manifest->>'format') IS DISTINCT FROM '1'
       OR jsonb_typeof(expected_manifest->'tables') IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(expected_manifest->'tables')) <> 10 THEN
      RAISE EXCEPTION 'OTP migration: missing/incompatible schema baseline; manual review required (no automatic upgrade)';
    END IF;
    FOREACH object_name IN ARRAY ARRAY[
      'users', 'customers', 'barbers', 'admin_accounts', 'ustara_schema_migrations',
      'registration_phone_limits', 'pending_registrations',
      'registration_otp_history', 'registration_security_events',
      'registration_admin_actions'
    ] LOOP
      FOREACH category IN ARRAY ARRAY['table', 'columns', 'constraints', 'indexes'] LOOP
        IF (expected_manifest->'tables'->object_name->category)
             IS DISTINCT FROM (actual_manifest->object_name->category) THEN
          mismatch_name := object_name;
          IF category <> 'table' THEN
            IF jsonb_typeof(expected_manifest->'tables'->object_name->category)
                 IS DISTINCT FROM 'array' THEN
              RAISE EXCEPTION 'OTP migration: malformed baseline for table %, category %',
                object_name, category;
            END IF;
            SELECT coalesce(e.item->>'name', a.item->>'name') INTO mismatch_name
            FROM jsonb_array_elements(expected_manifest->'tables'->object_name->category) e(item)
            FULL JOIN jsonb_array_elements(actual_manifest->object_name->category) a(item)
              ON e.item->>'name' = a.item->>'name'
            WHERE e.item IS DISTINCT FROM a.item
            ORDER BY coalesce(e.item->>'name', a.item->>'name')
            LIMIT 1;
          END IF;
          RAISE EXCEPTION 'OTP migration: schema mismatch in table %, category %, object %; no repair performed',
            object_name, category, coalesce(mismatch_name, object_name);
        END IF;
      END LOOP;
    END LOOP;
    RETURN;
  END IF;

  EXECUTE format('COMMENT ON TABLE %I.registration_phone_limits IS %L', schema_name,
    jsonb_build_object('version', version_name, 'format', '1', 'tables', actual_manifest)::text);
  INSERT INTO ustara_schema_migrations(version) VALUES (version_name);
END $$;

COMMIT;
