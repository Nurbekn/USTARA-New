-- Compatibility rollback for the previous backend. Credentials are restored
-- from users; user_id/FKs/users are retained, but user_id becomes nullable so
-- old profile-only INSERT statements continue to work. This is not a full
-- schema reversal: users and existing links are deliberately preserved.
BEGIN;
LOCK TABLE users,customers,barbers IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  legacy_columns INTEGER;
  customer_user_att SMALLINT;
  barber_user_att SMALLINT;
BEGIN
  SELECT count(*) INTO legacy_columns
  FROM information_schema.columns
  WHERE table_schema=current_schema()
    AND ((table_name='customers' AND column_name IN ('phone','password'))
      OR (table_name='barbers' AND column_name IN ('phone','password')));
  PERFORM set_config('ustara.rollback.restore_credentials', CASE WHEN legacy_columns=0 THEN 'yes' ELSE 'no' END, true);
  IF legacy_columns NOT IN (0,4) THEN
    RAISE EXCEPTION 'Rollback to''xtadi: profil credential ustunlarining faqat bir qismi bor';
  END IF;

  SELECT attnum INTO customer_user_att FROM pg_attribute
  WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum INTO barber_user_att FROM pg_attribute
  WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;
  IF customer_user_att IS NULL OR barber_user_att IS NULL THEN
    RAISE EXCEPTION 'Rollback to''xtadi: profil user_id ustuni yo''q';
  END IF;

  IF EXISTS (
    SELECT 1 FROM customers c LEFT JOIN users u ON u.id=c.user_id
    WHERE (c.user_id IS NULL AND legacy_columns=0)
       OR (c.user_id IS NOT NULL AND (u.id IS NULL OR u.role IS DISTINCT FROM 'customer'))
       OR (c.user_id IS NOT NULL AND (u.phone IS NULL OR u.password IS NULL))
  ) OR EXISTS (
    SELECT 1 FROM barbers b LEFT JOIN users u ON u.id=b.user_id
    WHERE (b.user_id IS NULL AND legacy_columns=0)
       OR (b.user_id IS NOT NULL AND (u.id IS NULL OR u.role IS DISTINCT FROM 'barber'))
       OR (b.user_id IS NOT NULL AND (u.phone IS NULL OR u.password IS NULL))
  ) THEN RAISE EXCEPTION 'Rollback bekor qilindi: profil-user bog''lanishlari mos emas'; END IF;

  IF legacy_columns=0 AND (
    EXISTS (SELECT 1 FROM customers c JOIN users u ON u.id=c.user_id GROUP BY u.phone HAVING count(*)>1)
    OR EXISTS (SELECT 1 FROM barbers b JOIN users u ON u.id=b.user_id GROUP BY u.phone HAVING count(*)>1)
  ) THEN RAISE EXCEPTION 'Rollback bekor qilindi: profil telefonlari takrorlangan'; END IF;
END $$;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS password TEXT;

-- Restore only on the first rollback. Re-running after the old app has edited
-- credentials must not overwrite those newer profile values from users.
DO $$
BEGIN
  -- The transaction-local flag records whether these columns predated rollback.
  IF current_setting('ustara.rollback.restore_credentials', true)='yes' THEN
    UPDATE customers c SET phone=u.phone,password=u.password FROM users u WHERE u.id=c.user_id;
    UPDATE barbers b SET phone=u.phone,password=u.password FROM users u WHERE u.id=b.user_id;
  END IF;
END $$;

ALTER TABLE customers ALTER COLUMN phone SET NOT NULL;
ALTER TABLE customers ALTER COLUMN password SET NOT NULL;
ALTER TABLE barbers ALTER COLUMN phone SET NOT NULL;
ALTER TABLE barbers ALTER COLUMN password SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM customers WHERE phone IS NULL OR password IS NULL)
     OR EXISTS (SELECT 1 FROM barbers WHERE phone IS NULL OR password IS NULL)
  THEN RAISE EXCEPTION 'Rollback bekor qilindi: profil credential qiymati NULL'; END IF;
  IF EXISTS (SELECT 1 FROM customers GROUP BY phone HAVING count(*)>1)
     OR EXISTS (SELECT 1 FROM barbers GROUP BY phone HAVING count(*)>1)
  THEN RAISE EXCEPTION 'Rollback bekor qilindi: profil telefonlari yagonaligi buzilgan'; END IF;
  IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid
      WHERE i.indrelid='customers'::regclass AND x.relname='customers_phone_unique_rollback'
        AND NOT (i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='phone' AND NOT attisdropped)))
     OR EXISTS (SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid=i.indexrelid
      WHERE i.indrelid='barbers'::regclass AND x.relname='barbers_phone_unique_rollback'
        AND NOT (i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='phone' AND NOT attisdropped)))
  THEN RAISE EXCEPTION 'Rollback indeks nomi noto''g''ri indeks uchun ishlatilgan'; END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_unique_rollback ON customers(phone);
CREATE UNIQUE INDEX IF NOT EXISTS barbers_phone_unique_rollback ON barbers(phone);
ALTER TABLE customers ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE barbers ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.ustara_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    current_schema()
  );
  EXECUTE format('DELETE FROM %I.ustara_schema_migrations WHERE version=$1', current_schema())
    USING '20261113_unified_accounts';
END $$;

COMMIT;
