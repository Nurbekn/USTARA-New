-- Faqat alohida tasdiqlangandan keyin: eski writerlarni to‘xtating.
-- Account hisoblagichi endi 0..4; yozuvlar va eski bloklar o‘chirilmaydi.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261123_security_login_policy';
  prerequisites CONSTANT TEXT[] := ARRAY['20261114_security_01_login_protection'];
  table_oid OID;
  baseline JSONB;
  table_signature JSONB;
  old_constraint TEXT;
  signature_sql TEXT := $signature$
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
        WHERE a.attrelid=$1 AND a.attnum>0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', k.conname, 'type', k.contype,
        'definition', pg_get_constraintdef(k.oid, false),
        'validated', k.convalidated, 'deferrable', k.condeferrable,
        'deferred', k.condeferred
      ) ORDER BY k.conname), '[]'::jsonb)
        FROM pg_catalog.pg_constraint k WHERE k.conrelid=$1),
      'indexes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', ic.relname, 'definition', pg_get_indexdef(i.indexrelid),
        'unique', i.indisunique, 'primary', i.indisprimary,
        'valid', i.indisvalid, 'ready', i.indisready,
        'live', i.indislive, 'exclusion', i.indisexclusion,
        'options', ic.reloptions
      ) ORDER BY ic.relname), '[]'::jsonb)
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
        WHERE i.indrelid=$1)
    ) FROM pg_catalog.pg_class c WHERE c.oid=$1
$signature$;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Login policy: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=prerequisites[1]) THEN
    RAISE EXCEPTION 'Login policy: prerequisite missing';
  END IF;
  LOCK TABLE login_attempt_limits IN ACCESS EXCLUSIVE MODE;
  table_oid := 'login_attempt_limits'::regclass;
  EXECUTE signature_sql INTO table_signature USING table_oid;
  baseline := obj_description(table_oid,'pg_class')::jsonb;
  IF baseline->>'version' IS DISTINCT FROM prerequisites[1]
     OR baseline->>'format' IS DISTINCT FROM '1'
     OR baseline->'signature' IS DISTINCT FROM table_signature THEN
    RAISE EXCEPTION 'Login policy: catalog drift; no automatic repair';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=version_name) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=table_oid
      AND conname='login_attempt_limits_policy_v2_check' AND contype='c' AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%failed_count < 5%') THEN
      RAISE EXCEPTION 'Login policy: new constraint missing or incompatible';
    END IF;
    RETURN;
  END IF;
  SELECT conname INTO STRICT old_constraint FROM pg_constraint
    WHERE conrelid=table_oid AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%failed_count < 3%'
      AND pg_get_constraintdef(oid) LIKE '%penalty_level <= 4%';
  EXECUTE format('ALTER TABLE login_attempt_limits DROP CONSTRAINT %I',old_constraint);
  ALTER TABLE login_attempt_limits ADD CONSTRAINT login_attempt_limits_policy_v2_check
    CHECK ((kind='account' AND failed_count<5 AND penalty_level<=4) OR
           (kind='ip' AND failed_count<10 AND penalty_level<=3));
  -- Eski penalty=4 saqlanadi; backend uni yangi 5 daqiqalik maksimumga moslaydi.
  EXECUTE signature_sql INTO table_signature USING table_oid;
  EXECUTE format('COMMENT ON TABLE login_attempt_limits IS %L',
    jsonb_build_object('version',prerequisites[1],'format','1','signature',table_signature)::text);
  INSERT INTO ustara_schema_migrations(version) VALUES(version_name);
END $migration$;
COMMIT;
