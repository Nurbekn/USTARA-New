-- Remove only the expected singleton table. Never cascade into other objects.
BEGIN;

DO $$
DECLARE
  schema_name TEXT := current_schema();
  table_oid OID;
  table_kind "char";
  id_att SMALLINT;
  active_att SMALLINT;
  created_att SMALLINT;
  column_count INTEGER;
  primary_key_count INTEGER;
  singleton_check_count INTEGER;
  constraint_count INTEGER;
  active_default TEXT;
  created_default TEXT;
BEGIN
  table_oid := to_regclass(format('%I.admin_accounts', schema_name));
  IF table_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT c.relkind INTO table_kind FROM pg_class c WHERE c.oid = table_oid;
  IF table_kind <> 'r' THEN
    RAISE EXCEPTION 'Rollback to''xtadi: admin_accounts oddiy jadval emas';
  END IF;
  EXECUTE format('LOCK TABLE %I.admin_accounts IN ACCESS EXCLUSIVE MODE', schema_name);

  SELECT count(*) INTO column_count FROM pg_attribute
  WHERE attrelid = table_oid AND attnum > 0 AND NOT attisdropped;
  IF column_count <> 3 THEN
    RAISE EXCEPTION 'Rollback to''xtadi: admin_accounts ustunlari kutilgan tuzilishga mos emas';
  END IF;

  SELECT attnum INTO id_att FROM pg_attribute
  WHERE attrelid = table_oid AND attname = 'id' AND NOT attisdropped
    AND atttypid = 'integer'::regtype AND attnotnull AND attidentity = '';
  SELECT attnum INTO active_att FROM pg_attribute
  WHERE attrelid = table_oid AND attname = 'is_active' AND NOT attisdropped
    AND atttypid = 'boolean'::regtype AND attnotnull;
  SELECT attnum INTO created_att FROM pg_attribute
  WHERE attrelid = table_oid AND attname = 'created_at' AND NOT attisdropped
    AND atttypid = 'timestamp with time zone'::regtype AND attnotnull;
  IF id_att IS NULL OR active_att IS NULL OR created_att IS NULL THEN
    RAISE EXCEPTION 'Rollback to''xtadi: admin_accounts ustunlari yoki NOT NULL talabi noto''g''ri';
  END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO active_default
  FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = active_att;
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO created_default
  FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = created_att;
  IF EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = id_att)
     OR regexp_replace(lower(coalesce(active_default, '')), '[[:space:]()]', '', 'g') <> 'true'
     OR regexp_replace(lower(coalesce(created_default, '')), '[[:space:]()]', '', 'g') <> 'now' THEN
    RAISE EXCEPTION 'Rollback to''xtadi: admin_accounts standart qiymatlari noto''g''ri';
  END IF;

  SELECT count(*) INTO primary_key_count FROM pg_constraint c
  WHERE c.conrelid = table_oid AND c.contype = 'p'
    AND c.conkey = ARRAY[id_att]::SMALLINT[] AND c.convalidated;
  SELECT count(*) INTO singleton_check_count FROM pg_constraint c
  WHERE c.conrelid = table_oid AND c.contype = 'c'
    AND c.conkey = ARRAY[id_att]::SMALLINT[] AND c.convalidated
    AND regexp_replace(pg_get_expr(c.conbin, c.conrelid), '[[:space:]()]', '', 'g') = 'id=1';
  SELECT count(*) INTO constraint_count FROM pg_constraint c WHERE c.conrelid = table_oid;
  IF primary_key_count <> 1 OR singleton_check_count <> 1 OR constraint_count <> 2 THEN
    RAISE EXCEPTION 'Rollback to''xtadi: admin_accounts constraintlari kutilgan tuzilishga mos emas';
  END IF;

  IF EXISTS (SELECT 1 FROM admin_accounts WHERE id <> 1)
     OR (SELECT count(*) FROM admin_accounts) > 1 THEN
    RAISE EXCEPTION 'Rollback to''xtadi: kutilmagan admin yozuvlari mavjud';
  END IF;

  IF EXISTS (SELECT 1 FROM admin_accounts WHERE id = 1 AND is_active = FALSE) THEN
    RAISE EXCEPTION 'Rollback to''xtadi: faol bo''lmagan admin holatini eski backendda saqlab bo''lmaydi';
  END IF;

  -- No CASCADE: dependent objects make DROP fail and roll the transaction back.
  EXECUTE format('DROP TABLE %I.admin_accounts', schema_name);
END $$;

DO $$
DECLARE
  schema_name TEXT := current_schema();
  tracking_oid OID;
  tracking_kind "char";
  tracking_column_count INTEGER;
  version_att SMALLINT;
  applied_at_att SMALLINT;
  primary_key SMALLINT[];
  applied_at_default TEXT;
BEGIN
  tracking_oid := to_regclass(format('%I.ustara_schema_migrations', schema_name));
  IF tracking_oid IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('ustara_schema_migrations') IS DISTINCT FROM tracking_oid THEN
    RAISE EXCEPTION 'Rollback to''xtadi: migration tracking jadvali faol schema bilan mos emas';
  END IF;
  SELECT relkind INTO tracking_kind FROM pg_class WHERE oid = tracking_oid;
  SELECT count(*) INTO tracking_column_count FROM pg_attribute
  WHERE attrelid = tracking_oid AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO version_att FROM pg_attribute
  WHERE attrelid = tracking_oid AND attname = 'version' AND NOT attisdropped
    AND atttypid = 'text'::regtype AND attnotnull AND atttypmod = -1;
  SELECT attnum INTO applied_at_att FROM pg_attribute
  WHERE attrelid = tracking_oid AND attname = 'applied_at' AND NOT attisdropped
    AND atttypid = 'timestamp with time zone'::regtype AND attnotnull;
  SELECT conkey INTO primary_key FROM pg_constraint
  WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated;
  SELECT pg_get_expr(adbin, adrelid) INTO applied_at_default
  FROM pg_attrdef WHERE adrelid = tracking_oid AND adnum = applied_at_att;
  IF tracking_kind <> 'r' OR tracking_column_count <> 2 OR version_att IS NULL OR applied_at_att IS NULL
     OR primary_key IS DISTINCT FROM ARRAY[version_att]::SMALLINT[]
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated) <> 1
     OR EXISTS (SELECT 1 FROM pg_attrdef WHERE adrelid = tracking_oid AND adnum = version_att)
     OR regexp_replace(lower(coalesce(applied_at_default, '')), '[[:space:]()]', '', 'g') <> 'now'
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = tracking_oid AND contype NOT IN ('p', 'n')) THEN
    RAISE EXCEPTION 'Rollback to''xtadi: migration tracking jadvali kutilgan tuzilishga mos emas';
  END IF;

  EXECUTE format('DELETE FROM %I.ustara_schema_migrations WHERE version = $1', schema_name)
    USING '20261113_unified_accounts_02_admin_accounts';
END $$;

COMMIT;
