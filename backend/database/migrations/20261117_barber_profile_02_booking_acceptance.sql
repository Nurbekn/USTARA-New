BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261117_barber_profile_02_booking_acceptance';
  prerequisite CONSTANT TEXT := '20261117_barber_profile';
  tracking_oid OID;
  barbers_oid OID;
  applied BOOLEAN;
  prerequisite_count INTEGER;
  column_type TEXT;
  column_not_null BOOLEAN;
  column_default TEXT;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Bron qabul qilish migrationi: faol schema yaroqsiz';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  tracking_oid := to_regclass(format('%I.ustara_schema_migrations',schema_name));
  barbers_oid := to_regclass(format('%I.barbers',schema_name));
  IF tracking_oid IS NULL OR barbers_oid IS NULL
     OR (SELECT count(*) FROM pg_class WHERE oid IN (tracking_oid,barbers_oid) AND relkind='r')<>2 THEN
    RAISE EXCEPTION 'Bron qabul qilish migrationi: migration tracking va barbers jadvallari talab qilinadi';
  END IF;

  EXECUTE format('LOCK TABLE ONLY %I.ustara_schema_migrations IN EXCLUSIVE MODE',schema_name);
  EXECUTE format('SELECT count(*) FROM %I.ustara_schema_migrations WHERE version=$1',schema_name)
    INTO prerequisite_count USING prerequisite;
  IF prerequisite_count<>1 THEN
    RAISE EXCEPTION 'Bron qabul qilish migrationi: oldingi migration belgisi topilmadi';
  END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.ustara_schema_migrations WHERE version=$1)',schema_name)
    INTO applied USING version_name;
  EXECUTE format('LOCK TABLE ONLY %I.barbers IN ACCESS EXCLUSIVE MODE',schema_name);

  IF applied THEN
    SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
      INTO column_type,column_not_null,column_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=barbers_oid AND a.attname='accepting_bookings'
      AND a.attnum>0 AND NOT a.attisdropped;
    IF column_type IS DISTINCT FROM 'boolean'
       OR column_not_null IS DISTINCT FROM TRUE
       OR column_default IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Bron qabul qilish migrationi: ustun ta’rifi mos emas';
    END IF;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=barbers_oid
      AND attname='accepting_bookings' AND attnum>0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Bron qabul qilish migrationi: belgilanmagan ustun mavjud; qo‘lda tekshirish kerak';
  END IF;

  EXECUTE format('ALTER TABLE %I.barbers ADD COLUMN accepting_bookings BOOLEAN NOT NULL DEFAULT TRUE',schema_name);
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1)',schema_name)
    USING version_name;
END $$;
COMMIT;
