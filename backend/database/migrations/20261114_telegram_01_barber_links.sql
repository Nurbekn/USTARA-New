-- Barber Telegram links only. No booking/login/OTP definitions are changed.
-- Apply standalone before deploying the API/worker. Stop other DDL in a
-- maintenance window; use the existing schema advisory-lock contract.
-- Transaction errors roll back all tables, comments and the tracking marker.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  version_name CONSTANT TEXT := '20261114_telegram_01_barber_links';
  table_names CONSTANT TEXT[] := ARRAY['barber_telegram_links','barber_telegram_link_tokens','telegram_bot_state'];
  prerequisites CONSTANT TEXT[] := ARRAY['20261113_00_users_foundation','20261113_unified_accounts','20261114_security_02_password_reset'];
  object_name TEXT;
  table_oid OID;
  tracking_oid OID;
  barber_oid OID;
  table_signature JSONB;
  manifest JSONB := '{}'::jsonb;
  baseline JSONB;
  already_applied BOOLEAN;
  marker_count INTEGER;
BEGIN
  IF schema_name IS NULL OR schema_name='information_schema' OR schema_name ~ '^pg_' THEN RAISE EXCEPTION 'Telegram migration: invalid active schema'; END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  tracking_oid := pg_catalog.to_regclass(format('%I.ustara_schema_migrations',schema_name));
  barber_oid := pg_catalog.to_regclass(format('%I.barbers',schema_name));
  IF tracking_oid IS NULL OR barber_oid IS NULL OR (SELECT count(*) FROM pg_catalog.pg_class
    WHERE oid=ANY(ARRAY[tracking_oid,barber_oid]) AND relkind='r' AND relpersistence<>'t')<>2 THEN
    RAISE EXCEPTION 'Telegram migration: ordinary tracking/barbers tables required';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('LOCK TABLE ONLY %I.barbers IN SHARE UPDATE EXCLUSIVE MODE',schema_name);
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=barber_oid OR inhparent=barber_oid) THEN RAISE EXCEPTION 'Telegram migration: inherited barbers require review'; END IF;
  EXECUTE format('SELECT count(DISTINCT version) FROM %I.ustara_schema_migrations WHERE version=ANY($1)',schema_name)
    INTO marker_count USING prerequisites;
  IF marker_count<>cardinality(prerequisites) THEN RAISE EXCEPTION 'Telegram migration: prerequisites missing'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO already_applied USING version_name;
  IF NOT already_applied THEN
    FOREACH object_name IN ARRAY table_names LOOP
      IF pg_catalog.to_regclass(format('%I.%I',schema_name,object_name)) IS NOT NULL THEN RAISE EXCEPTION 'Telegram migration: untracked object %',object_name; END IF;
    END LOOP;
    EXECUTE format('CREATE TABLE %I.barber_telegram_links (
      barber_id INTEGER PRIMARY KEY REFERENCES %I.barbers(id) ON DELETE CASCADE,
      chat_id BIGINT NOT NULL UNIQUE CHECK (chat_id>0 AND chat_id<=9007199254740991),
      linked_at TIMESTAMPTZ NOT NULL
    )',schema_name,schema_name);
    EXECUTE format('CREATE TABLE %I.barber_telegram_link_tokens (
      barber_id INTEGER PRIMARY KEY REFERENCES %I.barbers(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ %L),
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      session_version INTEGER NOT NULL CHECK (session_version>=0),
      CHECK (expires_at=created_at+interval %L)
    )',schema_name,schema_name,'^[0-9a-f]{64}$','5 minutes');
    EXECUTE format('CREATE INDEX barber_telegram_link_tokens_expiry_idx ON %I.barber_telegram_link_tokens(expires_at)',schema_name);
    EXECUTE format('CREATE TABLE %I.telegram_bot_state (
      bot_id BIGINT PRIMARY KEY CHECK (bot_id>0),
      next_update_id BIGINT NOT NULL DEFAULT 0 CHECK (next_update_id>=0)
    )',schema_name);
  END IF;
  FOREACH object_name IN ARRAY table_names LOOP
    table_oid := pg_catalog.to_regclass(format('%I.%I',schema_name,object_name));
    IF table_oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=table_oid AND relkind='r' AND relpersistence<>'t') THEN RAISE EXCEPTION 'Telegram migration: recorded table % missing/incompatible',object_name; END IF;
    EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS EXCLUSIVE MODE',schema_name,object_name);
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=table_oid OR inhparent=table_oid) THEN RAISE EXCEPTION 'Telegram migration: inheritance unsupported'; END IF;
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
  table_oid := pg_catalog.to_regclass(format('%I.barber_telegram_links',schema_name));
  IF already_applied THEN
    BEGIN baseline := pg_catalog.obj_description(table_oid,'pg_class')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Telegram migration: malformed baseline'; END;
    IF baseline->>'version' IS DISTINCT FROM version_name OR baseline->>'format' IS DISTINCT FROM '1'
       OR baseline->'tables' IS DISTINCT FROM manifest THEN RAISE EXCEPTION 'Telegram migration: schema drift; no repair'; END IF;
    RETURN;
  END IF;
  EXECUTE format('COMMENT ON TABLE %I.barber_telegram_links IS %L',schema_name,
    jsonb_build_object('version',version_name,'format','1','tables',manifest)::text);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES($1)',schema_name) USING version_name;
END $$;
COMMIT;
