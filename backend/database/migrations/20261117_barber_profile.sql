BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261117_barber_profile';
  prerequisite CONSTANT TEXT := '20261116_account_profile_deletion_integrity';
  tracking_oid OID;
  barbers_oid OID;
  applied BOOLEAN;
  prerequisite_count INTEGER;
  column_spec RECORD;
  column_type TEXT;
  column_nullable BOOLEAN;
  actual_check TEXT;
  expected_check TEXT;
  check_name TEXT;
  expected_table_oid OID;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Barber profil migrationi: faol schema yaroqsiz';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  tracking_oid := to_regclass(format('%I.ustara_schema_migrations',schema_name));
  barbers_oid := to_regclass(format('%I.barbers',schema_name));
  IF tracking_oid IS NULL OR barbers_oid IS NULL
     OR (SELECT count(*) FROM pg_class WHERE oid IN (tracking_oid,barbers_oid) AND relkind='r')<>2 THEN
    RAISE EXCEPTION 'Barber profil migrationi: migration tracking va barbers jadvallari talab qilinadi';
  END IF;
  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(*) FROM %I.ustara_schema_migrations WHERE version=$1',schema_name)
    INTO prerequisite_count USING prerequisite;
  IF prerequisite_count<>1 THEN
    RAISE EXCEPTION 'Barber profil migrationi: oldingi migration belgisi topilmadi';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO applied USING version_name;
  EXECUTE format('LOCK TABLE ONLY %I.barbers IN ACCESS EXCLUSIVE MODE',schema_name);

  IF NOT applied AND EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid=barbers_oid AND NOT attisdropped
      AND attname=ANY(ARRAY['salon_name','address','latitude','longitude','experience_years','bio','avatar_url'])
  ) THEN
    RAISE EXCEPTION 'Barber profil migrationi: belgilanmagan ustunlar bor; qo‘lda tekshirish kerak';
  END IF;

  IF applied THEN
    FOR column_spec IN
      SELECT * FROM (VALUES
        ('salon_name','text'),('address','text'),('latitude','double precision'),
        ('longitude','double precision'),('experience_years','integer'),
        ('bio','character varying'),('avatar_url','text')
      ) AS expected(name,type_name)
    LOOP
      SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull
        INTO column_type,column_nullable
      FROM pg_attribute a
      WHERE a.attrelid=barbers_oid AND a.attname=column_spec.name AND a.attnum>0 AND NOT a.attisdropped;
      IF column_type IS DISTINCT FROM (CASE WHEN column_spec.name='bio' THEN 'character varying(200)' ELSE column_spec.type_name END)
         OR column_nullable IS DISTINCT FROM FALSE
         OR EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
                    WHERE d.adrelid=barbers_oid AND a.attname=column_spec.name) THEN
        RAISE EXCEPTION 'Barber profil migrationi: qayd qilingan ustun ta’rifi mos emas: %',column_spec.name;
      END IF;
    END LOOP;

    CREATE TEMP TABLE ustara_barber_profile_expected (
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      experience_years INTEGER
    ) ON COMMIT DROP;
    ALTER TABLE pg_temp.ustara_barber_profile_expected
      ADD CONSTRAINT barber_profile_location_check CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL
         AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
      ),
      ADD CONSTRAINT barber_profile_experience_check CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 99);
    expected_table_oid := to_regclass('pg_temp.ustara_barber_profile_expected');
    FOREACH check_name IN ARRAY ARRAY['barbers_location_check','barbers_experience_years_check'] LOOP
      SELECT pg_get_constraintdef(c.oid,false) INTO actual_check
      FROM pg_constraint c WHERE c.conrelid=barbers_oid AND c.conname=check_name AND c.contype='c' AND c.convalidated;
      SELECT pg_get_constraintdef(c.oid,false) INTO expected_check
      FROM pg_constraint c WHERE c.conrelid=expected_table_oid
        AND c.conname=CASE check_name WHEN 'barbers_location_check' THEN 'barber_profile_location_check' ELSE 'barber_profile_experience_check' END
        AND c.contype='c' AND c.convalidated;
      IF actual_check IS NULL OR expected_check IS NULL OR actual_check IS DISTINCT FROM expected_check THEN
        RAISE EXCEPTION 'Barber profil migrationi: CHECK constraint ta’rifi mos emas: %',check_name;
      END IF;
    END LOOP;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=barbers_oid
    AND conname=ANY(ARRAY['barbers_location_check','barbers_experience_years_check'])) THEN
    RAISE EXCEPTION 'Barber profil migrationi: belgilanmagan CHECK constraint nomlari band';
  END IF;
  EXECUTE format($ddl$
    ALTER TABLE %I.barbers
      ADD COLUMN salon_name TEXT,
      ADD COLUMN address TEXT,
      ADD COLUMN latitude DOUBLE PRECISION,
      ADD COLUMN longitude DOUBLE PRECISION,
      ADD COLUMN experience_years INTEGER,
      ADD COLUMN bio VARCHAR(200),
      ADD COLUMN avatar_url TEXT,
      ADD CONSTRAINT barbers_location_check CHECK (
        (latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL
         AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
      ),
      ADD CONSTRAINT barbers_experience_years_check CHECK (
        experience_years IS NULL OR experience_years BETWEEN 0 AND 99
      )
  $ddl$,schema_name);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1)',schema_name)
    USING version_name;
END $$;
COMMIT;
