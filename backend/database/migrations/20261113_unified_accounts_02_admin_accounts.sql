-- Create the singleton database-backed admin identity without resetting its active state.
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
  tracking_oid OID;
  tracking_kind "char";
  tracking_column_count INTEGER;
  tracking_version_att SMALLINT;
  tracking_applied_at_att SMALLINT;
  tracking_primary_key_count INTEGER;
  tracking_primary_key SMALLINT[];
  tracking_applied_at_default TEXT;
BEGIN
  IF schema_name IS NULL THEN RAISE EXCEPTION 'Faol schema aniqlanmadi'; END IF;

  tracking_oid := to_regclass(format('%I.ustara_schema_migrations', schema_name));
  IF tracking_oid IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I.ustara_schema_migrations (
         version TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )',
      schema_name
    );
    tracking_oid := to_regclass(format('%I.ustara_schema_migrations', schema_name));
  END IF;
  IF tracking_oid IS NULL OR to_regclass('ustara_schema_migrations') IS DISTINCT FROM tracking_oid THEN
    RAISE EXCEPTION 'Migration tracking jadvali faol schema bilan mos emas';
  END IF;
  SELECT relkind INTO tracking_kind FROM pg_class WHERE oid = tracking_oid;
  IF tracking_kind <> 'r' THEN RAISE EXCEPTION 'Migration tracking obyekti oddiy jadval emas'; END IF;
  SELECT count(*) INTO tracking_column_count FROM pg_attribute
  WHERE attrelid = tracking_oid AND attnum > 0 AND NOT attisdropped;
  SELECT attnum INTO tracking_version_att FROM pg_attribute
  WHERE attrelid = tracking_oid AND attname = 'version' AND NOT attisdropped
    AND atttypid = 'text'::regtype AND attnotnull AND atttypmod = -1;
  SELECT attnum INTO tracking_applied_at_att FROM pg_attribute
  WHERE attrelid = tracking_oid AND attname = 'applied_at' AND NOT attisdropped
    AND atttypid = 'timestamp with time zone'::regtype AND attnotnull;
  IF tracking_column_count <> 2 OR tracking_version_att IS NULL OR tracking_applied_at_att IS NULL THEN
    RAISE EXCEPTION 'Migration tracking jadvali kutilgan ustunlarga mos emas';
  END IF;
  SELECT pg_get_expr(adbin, adrelid) INTO tracking_applied_at_default
  FROM pg_attrdef WHERE adrelid = tracking_oid AND adnum = tracking_applied_at_att;
  IF EXISTS (SELECT 1 FROM pg_attrdef WHERE adrelid = tracking_oid AND adnum = tracking_version_att)
     OR regexp_replace(lower(coalesce(tracking_applied_at_default, '')), '[[:space:]()]', '', 'g') <> 'now' THEN
    RAISE EXCEPTION 'Migration tracking jadvali DEFAULT qiymatlari mos emas';
  END IF;
  SELECT count(*) INTO tracking_primary_key_count FROM pg_constraint
  WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated;
  SELECT conkey INTO tracking_primary_key FROM pg_constraint
  WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated;
  IF tracking_primary_key_count <> 1
     OR tracking_primary_key IS DISTINCT FROM ARRAY[tracking_version_att]::SMALLINT[]
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = tracking_oid AND contype NOT IN ('p', 'n')) THEN
    RAISE EXCEPTION 'Migration tracking jadvali PRIMARY KEY yoki constraintlari mos emas';
  END IF;

  table_oid := to_regclass(format('%I.admin_accounts', schema_name));

  IF table_oid IS NULL THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.admin_accounts (
         id INTEGER NOT NULL,
         is_active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         CONSTRAINT admin_accounts_pkey PRIMARY KEY (id),
         CONSTRAINT admin_accounts_singleton_id_check CHECK (id = 1)
       )',
      schema_name
    );
    table_oid := to_regclass(format('%I.admin_accounts', schema_name));
  END IF;

  SELECT c.relkind INTO table_kind FROM pg_class c WHERE c.oid = table_oid;
  IF table_kind <> 'r' THEN
    RAISE EXCEPTION 'admin_accounts oddiy PostgreSQL jadvali emas';
  END IF;

  EXECUTE format('LOCK TABLE %I.admin_accounts IN ACCESS EXCLUSIVE MODE', schema_name);

  SELECT count(*) INTO column_count
  FROM pg_attribute
  WHERE attrelid = table_oid AND attnum > 0 AND NOT attisdropped;
  IF column_count <> 3 THEN
    RAISE EXCEPTION 'admin_accounts ustunlari kutilgan tuzilishga mos emas';
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
    RAISE EXCEPTION 'admin_accounts ustun nomlari, turlari yoki NOT NULL talabi noto''g''ri';
  END IF;

  SELECT pg_get_expr(d.adbin, d.adrelid) INTO active_default
  FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = active_att;
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO created_default
  FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = created_att;

  IF EXISTS (SELECT 1 FROM pg_attrdef d WHERE d.adrelid = table_oid AND d.adnum = id_att)
     OR regexp_replace(lower(coalesce(active_default, '')), '[[:space:]()]', '', 'g') <> 'true'
     OR regexp_replace(lower(coalesce(created_default, '')), '[[:space:]()]', '', 'g') <> 'now' THEN
    RAISE EXCEPTION 'admin_accounts ustun standart qiymatlari noto''g''ri';
  END IF;

  SELECT count(*) INTO primary_key_count FROM pg_constraint c
  WHERE c.conrelid = table_oid AND c.contype = 'p'
    AND c.conkey = ARRAY[id_att]::SMALLINT[] AND c.convalidated;
  SELECT count(*) INTO singleton_check_count FROM pg_constraint c
  WHERE c.conrelid = table_oid AND c.contype = 'c'
    AND c.conkey = ARRAY[id_att]::SMALLINT[] AND c.convalidated
    AND regexp_replace(pg_get_expr(c.conbin, c.conrelid), '[[:space:]()]', '', 'g') = 'id=1';
  SELECT count(*) INTO constraint_count FROM pg_constraint c WHERE c.conrelid = table_oid AND c.contype <> 'n';

  IF primary_key_count <> 1 OR singleton_check_count <> 1 OR constraint_count <> 2 THEN
    RAISE EXCEPTION 'admin_accounts PRIMARY KEY yoki id=1 singleton CHECK constrainti noto''g''ri';
  END IF;

  -- Seed only an empty table. ON CONFLICT preserves an existing inactive admin.
  EXECUTE format(
    'INSERT INTO %I.admin_accounts (id, is_active)
     SELECT 1, TRUE
     WHERE NOT EXISTS (SELECT 1 FROM %I.admin_accounts)
     ON CONFLICT (id) DO NOTHING',
    schema_name,
    schema_name
  );

  EXECUTE format(
    'INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1) ON CONFLICT(version) DO NOTHING',
    schema_name
  ) USING '20261113_unified_accounts_02_admin_accounts';
END $$;

COMMIT;
