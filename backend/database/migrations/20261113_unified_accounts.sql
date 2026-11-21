-- Atomic and repeat-safe unified account migration.
-- Run only on a reviewed database/backup. Conflicts abort the whole transaction.
BEGIN;

DO $$
DECLARE
  schema_name TEXT := current_schema();
  legacy_columns INTEGER;
  customer_user_att SMALLINT;
  barber_user_att SMALLINT;
  users_id_att SMALLINT;
  users_phone_att SMALLINT;
  customer_user_not_null BOOLEAN;
  barber_user_not_null BOOLEAN;
  users_phone_not_null BOOLEAN;
  users_phone_unique BOOLEAN;
  customer_user_unique BOOLEAN;
  barber_user_unique BOOLEAN;
  customer_user_fk BOOLEAN;
  barber_user_fk BOOLEAN;
  can_complete BOOLEAN;
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

  LOCK TABLE users,customers,barbers IN SHARE ROW EXCLUSIVE MODE;

  SELECT count(*) INTO legacy_columns
  FROM information_schema.columns
  WHERE table_schema=current_schema()
    AND ((table_name='customers' AND column_name IN ('phone','password'))
      OR (table_name='barbers' AND column_name IN ('phone','password')));

  IF legacy_columns NOT IN (0,4) THEN
    RAISE EXCEPTION 'Profil credential ustunlarining faqat bir qismi mavjud; migration to''xtatildi';
  END IF;

  SELECT attnum,attnotnull INTO customer_user_att,customer_user_not_null
  FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum,attnotnull INTO barber_user_att,barber_user_not_null
  FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum INTO users_id_att
  FROM pg_attribute WHERE attrelid='users'::regclass AND attname='id' AND NOT attisdropped;
  SELECT attnum,attnotnull INTO users_phone_att,users_phone_not_null
  FROM pg_attribute WHERE attrelid='users'::regclass AND attname='phone' AND NOT attisdropped;

  IF users_phone_att IS NULL OR users_id_att IS NULL THEN
    RAISE EXCEPTION 'users.id yoki users.phone ustuni topilmadi';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid='users'::regclass AND i.indisunique AND i.indisvalid AND i.indisready
      AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1
      AND i.indkey[0]=users_phone_att
  ) INTO users_phone_unique;

  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
    WHERE i.indrelid='users'::regclass AND ix.relname='users_phone_unique'
      AND NOT (i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=users_phone_att)
  ) THEN RAISE EXCEPTION 'users_phone_unique nomli indeks users.phone yagonaligini ta''minlamaydi'; END IF;

  IF NOT users_phone_not_null THEN
    IF EXISTS (SELECT 1 FROM users WHERE phone IS NULL) OR legacy_columns=0 THEN
      RAISE EXCEPTION 'users.phone NOT NULL talabi bajarilmagan';
    END IF;
    ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
  END IF;

  IF legacy_columns=0 THEN
    -- A prior migration marker never bypasses structural and data validation.
    IF NOT users_phone_unique THEN RAISE EXCEPTION 'users.phone UNIQUE indeksi yoki cheklovi yo''q'; END IF;
    IF customer_user_att IS NULL OR barber_user_att IS NULL
       OR NOT customer_user_not_null OR NOT barber_user_not_null THEN
      RAISE EXCEPTION 'customers.user_id va barbers.user_id NOT NULL bo''lishi shart';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid='customers'::regclass
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=customer_user_att
    ) INTO customer_user_unique;
    SELECT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid='barbers'::regclass
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=barber_user_att
    ) INTO barber_user_unique;

    IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid='customers'::regclass
        AND x.relname='customers_user_id_unique' AND NOT (i.indisunique AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=customer_user_att))
       OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid='barbers'::regclass
        AND x.relname='barbers_user_id_unique' AND NOT (i.indisunique AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=barber_user_att))
    THEN RAISE EXCEPTION 'user_id indeks nomi noto''g''ri indeks uchun ishlatilgan'; END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_constraint f
      WHERE f.conrelid='customers'::regclass AND f.contype='f' AND f.convalidated
        AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1 AND f.conkey[1]=customer_user_att
        AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att
    ) INTO customer_user_fk;
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint f
      WHERE f.conrelid='barbers'::regclass AND f.contype='f' AND f.convalidated
        AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1 AND f.conkey[1]=barber_user_att
        AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att
    ) INTO barber_user_fk;

    IF EXISTS (
      SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='user_id'
      WHERE f.conrelid='customers'::regclass AND f.contype='f' AND a.attnum=ANY(f.conkey)
        AND NOT (f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1
          AND f.conkey[1]=customer_user_att AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att)
    ) OR EXISTS (
      SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='user_id'
      WHERE f.conrelid='barbers'::regclass AND f.contype='f' AND a.attnum=ANY(f.conkey)
        AND NOT (f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1
          AND f.conkey[1]=barber_user_att AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att)
    ) THEN RAISE EXCEPTION 'user_id uchun noto''g''ri yoki NOT VALID FK topildi'; END IF;

    IF NOT customer_user_unique OR NOT barber_user_unique THEN
      RAISE EXCEPTION 'user_id uchun aynan bitta ustunli UNIQUE indeks yoki constraint yo''q';
    END IF;
    IF NOT customer_user_fk OR NOT barber_user_fk THEN
      RAISE EXCEPTION 'user_id foreign key ustunlari users.id ga to''g''ri bog''lanmagan';
    END IF;
    IF EXISTS (SELECT 1 FROM customers WHERE user_id IS NULL)
       OR EXISTS (SELECT 1 FROM barbers WHERE user_id IS NULL)
       OR EXISTS (SELECT user_id FROM customers GROUP BY user_id HAVING count(*)>1)
       OR EXISTS (SELECT user_id FROM barbers GROUP BY user_id HAVING count(*)>1)
       OR EXISTS (SELECT 1 FROM customers c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL OR u.role IS DISTINCT FROM 'customer' OR u.created_at IS DISTINCT FROM c.created_at)
       OR EXISTS (SELECT 1 FROM barbers b LEFT JOIN users u ON u.id=b.user_id WHERE u.id IS NULL OR u.role IS DISTINCT FROM 'barber' OR u.created_at IS DISTINCT FROM b.created_at)
       OR EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id WHERE u.role='customer' AND c.id IS NULL)
       OR EXISTS (SELECT 1 FROM users u LEFT JOIN barbers b ON b.user_id=u.id WHERE u.role='barber' AND b.id IS NULL)
       OR EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id LEFT JOIN barbers b ON b.user_id=u.id
                  WHERE u.role='customer' AND (c.id IS NULL OR b.id IS NOT NULL))
       OR EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id LEFT JOIN barbers b ON b.user_id=u.id
                  WHERE u.role='barber' AND (b.id IS NULL OR c.id IS NOT NULL))
       OR EXISTS (SELECT 1 FROM users WHERE role IS NULL OR role NOT IN ('customer','barber'))
    THEN RAISE EXCEPTION 'Mavjud profil/account mappinglari to''liq yoki mos emas'; END IF;

    EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1) ON CONFLICT(version) DO NOTHING', schema_name)
      USING '20261113_unified_accounts';
    RETURN;
  END IF;

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id INTEGER;
  ALTER TABLE barbers ADD COLUMN IF NOT EXISTS user_id INTEGER;
  SELECT attnum,attnotnull INTO customer_user_att,customer_user_not_null
  FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum,attnotnull INTO barber_user_att,barber_user_not_null
  FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;

  IF EXISTS (SELECT 1 FROM customers GROUP BY phone HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM barbers GROUP BY phone HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM users GROUP BY phone HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM customers c JOIN barbers b ON b.phone=c.phone)
  THEN RAISE EXCEPTION 'Takroriy telefon topildi; qo''lda hal qiling'; END IF;

  IF EXISTS (SELECT 1 FROM customers c JOIN users u ON u.phone=c.phone WHERE u.role IS DISTINCT FROM 'customer')
     OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.phone=b.phone WHERE u.role IS DISTINCT FROM 'barber')
     OR EXISTS (SELECT 1 FROM customers c JOIN users u ON u.id=c.user_id WHERE u.role IS DISTINCT FROM 'customer')
     OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.id=b.user_id WHERE u.role IS DISTINCT FROM 'barber')
  THEN RAISE EXCEPTION 'Profil va account role ziddiyati topildi'; END IF;

  IF EXISTS (SELECT 1 FROM customers WHERE created_at IS NULL)
     OR EXISTS (SELECT 1 FROM barbers WHERE created_at IS NULL)
     OR EXISTS (SELECT 1 FROM users u JOIN customers c ON c.phone=u.phone WHERE u.created_at IS DISTINCT FROM c.created_at)
     OR EXISTS (SELECT 1 FROM users u JOIN barbers b ON b.phone=u.phone WHERE u.created_at IS DISTINCT FROM b.created_at)
     OR EXISTS (SELECT 1 FROM users u JOIN customers c ON c.user_id=u.id WHERE u.created_at IS DISTINCT FROM c.created_at)
     OR EXISTS (SELECT 1 FROM users u JOIN barbers b ON b.user_id=u.id WHERE u.created_at IS DISTINCT FROM b.created_at)
  THEN RAISE EXCEPTION 'Profil va mavjud users.created_at sanalari mos emas'; END IF;

  IF EXISTS (SELECT 1 FROM customers c JOIN users u ON u.phone=c.phone WHERE c.user_id IS NOT NULL AND c.user_id<>u.id)
     OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.phone=b.phone WHERE b.user_id IS NOT NULL AND b.user_id<>u.id)
     OR EXISTS (SELECT 1 FROM customers c JOIN users u ON u.id=c.user_id WHERE u.phone IS DISTINCT FROM c.phone OR u.password IS DISTINCT FROM c.password)
     OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.id=b.user_id WHERE u.phone IS DISTINCT FROM b.phone OR u.password IS DISTINCT FROM b.password)
     OR EXISTS (SELECT 1 FROM customers c JOIN users u ON u.phone=c.phone WHERE u.password IS DISTINCT FROM c.password)
     OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.phone=b.phone WHERE u.password IS DISTINCT FROM b.password)
  THEN RAISE EXCEPTION 'Oldindan mavjud user_id yoki credential ziddiyati topildi'; END IF;

  IF EXISTS (SELECT 1 FROM customers WHERE phone IS NULL OR password IS NULL)
     OR EXISTS (SELECT 1 FROM barbers WHERE phone IS NULL OR password IS NULL)
     OR EXISTS (SELECT 1 FROM users WHERE phone IS NULL OR password IS NULL)
  THEN RAISE EXCEPTION 'Telefon yoki parol qiymati NULL; migration to''xtatildi'; END IF;

  IF NOT users_phone_unique THEN
    EXECUTE format('CREATE UNIQUE INDEX users_phone_unique ON %I.users(phone)', current_schema());
  END IF;

  -- Hashes are copied verbatim. Profile primary keys and child-table IDs stay unchanged.
  INSERT INTO users(phone,password,role,created_at)
  SELECT c.phone,c.password,'customer',c.created_at FROM customers c
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.phone=c.phone)
  ON CONFLICT(phone) DO NOTHING;
  INSERT INTO users(phone,password,role,created_at)
  SELECT b.phone,b.password,'barber',b.created_at FROM barbers b
  WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.phone=b.phone)
  ON CONFLICT(phone) DO NOTHING;

  UPDATE customers c SET user_id=u.id FROM users u
  WHERE c.user_id IS NULL AND u.phone=c.phone AND u.role='customer';
  UPDATE barbers b SET user_id=u.id FROM users u
  WHERE b.user_id IS NULL AND u.phone=b.phone AND u.role='barber';

  IF EXISTS (SELECT 1 FROM customers WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM barbers WHERE user_id IS NULL)
     OR EXISTS (SELECT user_id FROM customers GROUP BY user_id HAVING count(*)>1)
     OR EXISTS (SELECT user_id FROM barbers GROUP BY user_id HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM customers c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL OR u.role IS DISTINCT FROM 'customer' OR u.phone IS DISTINCT FROM c.phone OR u.password IS DISTINCT FROM c.password OR u.created_at IS DISTINCT FROM c.created_at)
     OR EXISTS (SELECT 1 FROM barbers b LEFT JOIN users u ON u.id=b.user_id WHERE u.id IS NULL OR u.role IS DISTINCT FROM 'barber' OR u.phone IS DISTINCT FROM b.phone OR u.password IS DISTINCT FROM b.password OR u.created_at IS DISTINCT FROM b.created_at)
     OR EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id LEFT JOIN barbers b ON b.user_id=u.id
                WHERE u.role='customer' AND (c.id IS NULL OR b.id IS NOT NULL OR u.created_at IS DISTINCT FROM c.created_at))
     OR EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id LEFT JOIN barbers b ON b.user_id=u.id
                WHERE u.role='barber' AND (b.id IS NULL OR c.id IS NOT NULL OR u.created_at IS DISTINCT FROM b.created_at))
     OR EXISTS (SELECT 1 FROM users WHERE role IS NULL OR role NOT IN ('customer','barber'))
  THEN RAISE EXCEPTION 'Barcha profil-user bog''lanishlari tekshiruvdan o''tmadi'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='user_id'
    WHERE f.conrelid='customers'::regclass AND f.contype='f' AND a.attnum=ANY(f.conkey)
      AND NOT (f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1
        AND f.conkey[1]=customer_user_att AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att)
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint f JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attname='user_id'
    WHERE f.conrelid='barbers'::regclass AND f.contype='f' AND a.attnum=ANY(f.conkey)
      AND NOT (f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1
        AND f.conkey[1]=barber_user_att AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att)
  ) THEN RAISE EXCEPTION 'user_id uchun noto''g''ri yoki NOT VALID FK topildi'; END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='customers'::regclass AND conname='customers_user_id_fkey' AND contype<>'f')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='barbers'::regclass AND conname='barbers_user_id_fkey' AND contype<>'f')
  THEN RAISE EXCEPTION 'Kutilgan FK nomi boshqa constraint uchun ishlatilgan'; END IF;
  SELECT EXISTS (SELECT 1 FROM pg_constraint f WHERE f.conrelid='customers'::regclass AND f.contype='f'
    AND f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1 AND f.conkey[1]=customer_user_att
    AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att) INTO customer_user_fk;
  SELECT EXISTS (SELECT 1 FROM pg_constraint f WHERE f.conrelid='barbers'::regclass AND f.contype='f'
    AND f.convalidated AND f.confrelid='users'::regclass AND cardinality(f.conkey)=1 AND f.conkey[1]=barber_user_att
    AND cardinality(f.confkey)=1 AND f.confkey[1]=users_id_att) INTO barber_user_fk;
  IF NOT customer_user_fk THEN
    ALTER TABLE customers ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id);
  END IF;
  IF NOT barber_user_fk THEN
    ALTER TABLE barbers ADD CONSTRAINT barbers_user_id_fkey FOREIGN KEY(user_id) REFERENCES users(id);
  END IF;

  ALTER TABLE customers ALTER COLUMN user_id SET NOT NULL;
  ALTER TABLE barbers ALTER COLUMN user_id SET NOT NULL;
  SELECT attnotnull INTO customer_user_not_null FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnotnull INTO barber_user_not_null FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;
  IF NOT customer_user_not_null OR NOT barber_user_not_null THEN
    RAISE EXCEPTION 'user_id NOT NULL constraint o''rnatilmadi';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='customers'::regclass
    AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
    AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=customer_user_att) INTO customer_user_unique;
  SELECT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='barbers'::regclass
    AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
    AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=barber_user_att) INTO barber_user_unique;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid='customers'::regclass
      AND x.relname='customers_user_id_unique' AND NOT (i.indisunique AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=customer_user_att))
     OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid WHERE i.indrelid='barbers'::regclass
      AND x.relname='barbers_user_id_unique' AND NOT (i.indisunique AND i.indisvalid AND i.indisready
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=barber_user_att))
  THEN RAISE EXCEPTION 'user_id indeks nomi noto''g''ri indeks uchun ishlatilgan'; END IF;
  IF NOT customer_user_unique THEN EXECUTE format('CREATE UNIQUE INDEX customers_user_id_unique ON %I.customers(user_id)', current_schema()); END IF;
  IF NOT barber_user_unique THEN EXECUTE format('CREATE UNIQUE INDEX barbers_user_id_unique ON %I.barbers(user_id)', current_schema()); END IF;

  ALTER TABLE customers DROP COLUMN phone;
  ALTER TABLE customers DROP COLUMN password;
  ALTER TABLE barbers DROP COLUMN phone;
  ALTER TABLE barbers DROP COLUMN password;
  EXECUTE format('INSERT INTO %I.ustara_schema_migrations(version) VALUES ($1) ON CONFLICT(version) DO NOTHING', schema_name)
    USING '20261113_unified_accounts';
END $$;

COMMIT;
