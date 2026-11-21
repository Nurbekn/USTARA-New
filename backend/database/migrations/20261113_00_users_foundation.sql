-- Users jadvali uchun tayyorlov bosqichi.
-- Bajarilish tartibi:
--   1. 20261113_00_users_foundation.sql
--   2. 20261113_unified_accounts.sql
--   3. 20261113_unified_accounts_02_admin_accounts.sql
-- Bu fayl account ma'lumotlarini ko'chirmaydi va profil jadvallariga tegmaydi.
BEGIN;

DO $$
DECLARE
  schema_name TEXT := current_schema();
  users_oid OID;
  table_kind "char";
  column_count INTEGER;
  id_att SMALLINT;
  phone_att SMALLINT;
  password_att SMALLINT;
  role_att SMALLINT;
  created_at_att SMALLINT;
  primary_key_count INTEGER;
  unique_phone_count INTEGER;
  role_check_count INTEGER;
  role_check_oid OID;
  role_check_expression TEXT;
  created_at_default TEXT;
  tracking_oid OID;
  tracking_kind "char";
  tracking_column_count INTEGER;
  tracking_version_att SMALLINT;
  tracking_applied_at_att SMALLINT;
  tracking_primary_key_count INTEGER;
  tracking_primary_key SMALLINT[];
  tracking_applied_at_default TEXT;
BEGIN
  IF schema_name IS NULL THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: faol schema aniqlanmadi';
  END IF;

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
  IF tracking_kind <> 'r' THEN
    RAISE EXCEPTION 'Migration tracking obyekti oddiy jadval emas';
  END IF;
  SELECT count(*) INTO tracking_column_count
  FROM pg_attribute
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
  SELECT count(*) INTO tracking_primary_key_count
  FROM pg_constraint WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated;
  SELECT conkey INTO tracking_primary_key
  FROM pg_constraint WHERE conrelid = tracking_oid AND contype = 'p' AND convalidated;
  IF tracking_primary_key_count <> 1
     OR tracking_primary_key IS DISTINCT FROM ARRAY[tracking_version_att]::SMALLINT[]
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = tracking_oid AND contype NOT IN ('p', 'n')) THEN
    RAISE EXCEPTION 'Migration tracking jadvali PRIMARY KEY yoki constraintlari mos emas';
  END IF;

  users_oid := to_regclass(format('%I.users', schema_name));

  IF users_oid IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I.users (
         id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
         phone VARCHAR(20) NOT NULL UNIQUE,
         password VARCHAR(255) NOT NULL,
         role VARCHAR(20) NOT NULL CHECK (role IN (''customer'', ''barber'')),
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )',
      schema_name
    );
    users_oid := to_regclass(format('%I.users', schema_name));
  END IF;

  IF users_oid IS NULL THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: users jadvali yaratilmagan';
  END IF;

  SELECT relkind INTO table_kind FROM pg_class WHERE oid = users_oid;
  IF table_kind <> 'r' THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: users oddiy jadval emas';
  END IF;

  IF to_regclass('users') IS DISTINCT FROM users_oid THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: search_path ichida boshqa users obyekti bor';
  END IF;

  SELECT count(*) INTO column_count
  FROM pg_attribute
  WHERE attrelid = users_oid AND attnum > 0 AND NOT attisdropped;
  IF column_count <> 5 THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: users ustunlari kutilgan tuzilishga mos emas';
  END IF;

  SELECT attnum INTO id_att FROM pg_attribute
  WHERE attrelid = users_oid AND attname = 'id' AND NOT attisdropped
    AND atttypid = 'integer'::regtype AND attnotnull AND attidentity = 'a' AND attgenerated = '';
  SELECT attnum INTO phone_att FROM pg_attribute
  WHERE attrelid = users_oid AND attname = 'phone' AND NOT attisdropped
    AND atttypid = 'character varying'::regtype AND atttypmod = 24
    AND attnotnull AND attidentity = '' AND attgenerated = '';
  SELECT attnum INTO password_att FROM pg_attribute
  WHERE attrelid = users_oid AND attname = 'password' AND NOT attisdropped
    AND atttypid = 'character varying'::regtype AND atttypmod = 259
    AND attnotnull AND attidentity = '' AND attgenerated = '';
  SELECT attnum INTO role_att FROM pg_attribute
  WHERE attrelid = users_oid AND attname = 'role' AND NOT attisdropped
    AND atttypid = 'character varying'::regtype AND atttypmod = 24
    AND attnotnull AND attidentity = '' AND attgenerated = '';
  SELECT attnum INTO created_at_att FROM pg_attribute
  WHERE attrelid = users_oid AND attname = 'created_at' AND NOT attisdropped
    AND atttypid = 'timestamp with time zone'::regtype
    AND attnotnull AND attidentity = '' AND attgenerated = '';

  IF id_att IS NULL OR phone_att IS NULL OR password_att IS NULL
     OR role_att IS NULL OR created_at_att IS NULL THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: users ustunlari nomi, turi yoki cheklovlari mos emas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attrdef
    WHERE adrelid = users_oid AND adnum IN (id_att, phone_att, password_att, role_att)
      AND adnum <> id_att
  ) THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: phone, password yoki role uchun kutilmagan DEFAULT bor';
  END IF;

  SELECT pg_get_expr(adbin, adrelid) INTO created_at_default
  FROM pg_attrdef WHERE adrelid = users_oid AND adnum = created_at_att;
  IF regexp_replace(lower(coalesce(created_at_default, '')), '[[:space:]()]', '', 'g') <> 'now' THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: created_at DEFAULT now() emas';
  END IF;

  SELECT count(*) INTO primary_key_count
  FROM pg_constraint
  WHERE conrelid = users_oid AND contype = 'p' AND convalidated
    AND conkey = ARRAY[id_att]::SMALLINT[];
  SELECT count(*) INTO unique_phone_count
  FROM pg_constraint
  WHERE conrelid = users_oid AND contype = 'u' AND convalidated
    AND conkey = ARRAY[phone_att]::SMALLINT[];
  SELECT count(*) INTO role_check_count
  FROM pg_constraint
  WHERE conrelid = users_oid AND contype = 'c' AND convalidated
    AND conkey = ARRAY[role_att]::SMALLINT[];
  SELECT oid INTO role_check_oid
  FROM pg_constraint
  WHERE conrelid = users_oid AND contype = 'c' AND convalidated
    AND conkey = ARRAY[role_att]::SMALLINT[];

  IF primary_key_count <> 1 OR unique_phone_count <> 1 OR role_check_count <> 1 THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: PRIMARY KEY, phone UNIQUE yoki role CHECK mos emas';
  END IF;

  SELECT regexp_replace(
           regexp_replace(
             lower(pg_get_constraintdef(role_check_oid)),
             '::character varying|::text\[\]|::text', '', 'g'
           ),
           '[[:space:]()]', '', 'g'
         )
    INTO role_check_expression;
  role_check_expression := replace(role_check_expression, '"', '');
  IF role_check_expression <> 'checkrole=anyarray[''customer'',''barber'']' THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: role CHECK customer/barber bilan mos emas';
  END IF;

  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = users_oid AND contype IN ('p', 'u', 'c')
  ) <> 3 THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: kutilmagan PRIMARY KEY, UNIQUE yoki CHECK constraint bor';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = users_oid AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: users jadvalida kutilmagan FOREIGN KEY bor';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = users_oid AND contype NOT IN ('p', 'u', 'c', 'n')
  ) THEN
    RAISE EXCEPTION 'Users tayyorlov migrationi to''xtadi: kutilmagan constraint turi bor';
  END IF;

  EXECUTE format(
    'INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1) ON CONFLICT(version) DO NOTHING',
    schema_name
  ) USING '20261113_00_users_foundation';
END $$;

COMMIT;
