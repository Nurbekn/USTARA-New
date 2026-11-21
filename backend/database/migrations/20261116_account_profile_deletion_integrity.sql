BEGIN;

DO $$
DECLARE
  v_schema TEXT := current_schema();
  v_version CONSTANT TEXT := '20261116_account_profile_deletion_integrity';
  prerequisites CONSTANT TEXT[] := ARRAY[
    '20261113_00_users_foundation','20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts','20261114_otp_registration',
    '20261114_otp_registration_02_profile_names','20261114_otp_registration_03_barber_specialty',
    '20261114_security_01_login_protection','20261114_security_02_password_reset',
    '20261114_slots_01_booking_duration','20261114_telegram_01_barber_links',
    '20261115_slots_02_booking_no_overlap'
  ];
  v_applied BOOLEAN;
  v_user_id_att SMALLINT;
  v_role_att SMALLINT;
  v_customer_user_att SMALLINT;
  v_barber_user_att SMALLINT;
  v_customer_user_not_null BOOLEAN;
  v_barber_user_not_null BOOLEAN;
  v_fk RECORD;
  v_fk_count INTEGER;
  v_table TEXT;
  v_att SMALLINT;
  v_table_oid OID;
  v_object TEXT;
  v_signature JSONB;
  v_manifest JSONB := '{}'::jsonb;
  v_archive JSONB;
  v_archive_text TEXT;
BEGIN
  IF v_schema IS NULL OR v_schema IN ('pg_catalog','information_schema') THEN
    RAISE EXCEPTION 'Account/profile migration: invalid active schema';
  END IF;
  PERFORM set_config('search_path', format('%I, pg_catalog, pg_temp', v_schema), true);

  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF (SELECT count(*) FROM ustara_schema_migrations WHERE version = ANY(prerequisites)) <> cardinality(prerequisites) THEN
    RAISE EXCEPTION 'Account/profile migration: prerequisite markers missing';
  END IF;
  SELECT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=v_version)
    INTO v_applied;

  LOCK TABLE users, customers, barbers IN ACCESS EXCLUSIVE MODE;
  IF v_applied THEN
    -- Marker-present validation path. It never changes persistent target objects.
    -- Temporary reference constraints let PostgreSQL canonicalize CHECK expressions
    -- with this server's own catalog deparser before comparing them to live objects.
    DECLARE
      v_users_oid OID := to_regclass(format('%I.users',v_schema));
      v_customers_oid OID := to_regclass(format('%I.customers',v_schema));
      v_barbers_oid OID := to_regclass(format('%I.barbers',v_schema));
      v_user_id_att SMALLINT;
      v_user_role_att SMALLINT;
      v_customer_user_att SMALLINT;
      v_customer_role_att SMALLINT;
      v_barber_user_att SMALLINT;
      v_barber_role_att SMALLINT;
      v_role_key_oid OID;
      v_role_key_index_oid OID;
      v_fk_spec RECORD;
      v_fk_oid OID;
      v_trigger_spec RECORD;
      v_trigger_oid OID;
      v_trigger_constraint_oid OID;
      v_function_spec RECORD;
      v_function_oid OID;
      v_function RECORD;
      v_function_definition TEXT;
      v_expected_search_path TEXT;
      v_expected_customer_checks_oid OID;
      v_expected_barber_checks_oid OID;
    BEGIN
      IF v_users_oid IS NULL OR v_customers_oid IS NULL OR v_barbers_oid IS NULL THEN
        RAISE EXCEPTION 'Account/profile migration: recorded account/profile table missing; manual review required';
      END IF;
      SELECT attnum INTO v_user_id_att FROM pg_attribute WHERE attrelid=v_users_oid AND attname='id' AND NOT attisdropped;
      SELECT attnum INTO v_user_role_att FROM pg_attribute WHERE attrelid=v_users_oid AND attname='role' AND NOT attisdropped;
      SELECT attnum INTO v_customer_user_att FROM pg_attribute WHERE attrelid=v_customers_oid AND attname='user_id' AND NOT attisdropped;
      SELECT attnum INTO v_customer_role_att FROM pg_attribute WHERE attrelid=v_customers_oid AND attname='role' AND NOT attisdropped;
      SELECT attnum INTO v_barber_user_att FROM pg_attribute WHERE attrelid=v_barbers_oid AND attname='user_id' AND NOT attisdropped;
      SELECT attnum INTO v_barber_role_att FROM pg_attribute WHERE attrelid=v_barbers_oid AND attname='role' AND NOT attisdropped;
      IF v_user_id_att IS NULL OR v_user_role_att IS NULL OR v_customer_user_att IS NULL
         OR v_customer_role_att IS NULL OR v_barber_user_att IS NULL OR v_barber_role_att IS NULL THEN
        RAISE EXCEPTION 'Account/profile migration: recorded account/profile columns missing; manual review required';
      END IF;

      SELECT c.oid,c.conindid INTO v_role_key_oid,v_role_key_index_oid
      FROM pg_constraint c
      WHERE c.conrelid=v_users_oid AND c.conname='users_id_role_key' AND c.contype='u';
      IF v_role_key_oid IS NULL OR v_role_key_index_oid IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_index i ON i.indexrelid=c.conindid
        WHERE c.oid=v_role_key_oid AND c.conrelid=v_users_oid AND c.contype='u'
          AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
          AND c.conkey=ARRAY[v_user_id_att,v_user_role_att]::smallint[]
          AND i.indexrelid=v_role_key_index_oid AND i.indrelid=v_users_oid
          AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive
          AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnkeyatts=2 AND i.indnatts=2
          AND i.indkey[0]=v_user_id_att AND i.indkey[1]=v_user_role_att
      ) THEN
        RAISE EXCEPTION 'Account/profile migration: users_id_role_key has an incorrect or invalid (id, role) definition; manual review required';
      END IF;

      IF (SELECT count(*) FROM pg_attribute WHERE attrelid=v_customers_oid AND NOT attisdropped
          AND attname=ANY(ARRAY['user_id','role','first_name','last_name']) AND attnotnull)<>4
         OR (SELECT count(*) FROM pg_attribute WHERE attrelid=v_barbers_oid AND NOT attisdropped
          AND attname=ANY(ARRAY['user_id','role','first_name','last_name','specialty']) AND attnotnull)<>5 THEN
        RAISE EXCEPTION 'Account/profile migration: required profile columns are not NOT NULL; manual review required';
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=v_customers_oid
          AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=v_customer_user_att)
         OR NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=v_barbers_oid
          AND i.indisunique AND i.indisvalid AND i.indisready AND i.indislive AND i.indpred IS NULL AND i.indexprs IS NULL
          AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=v_barber_user_att) THEN
        RAISE EXCEPTION 'Account/profile migration: profile UNIQUE(user_id) index is missing or invalid; manual review required';
      END IF;

      FOR v_fk_spec IN
        SELECT * FROM (VALUES
          ('customers'::text,v_customers_oid,v_customer_user_att,v_customer_role_att,'customers_user_role_fkey'::text),
          ('barbers'::text,v_barbers_oid,v_barber_user_att,v_barber_role_att,'barbers_user_role_fkey'::text)
        ) AS expected(table_name,profile_oid,user_att,role_att,constraint_name)
      LOOP
        SELECT c.oid INTO v_fk_oid FROM pg_constraint c
        WHERE c.conrelid=v_fk_spec.profile_oid AND c.conname=v_fk_spec.constraint_name;
        IF v_fk_oid IS NULL OR NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          WHERE c.oid=v_fk_oid AND c.conname=v_fk_spec.constraint_name
            AND c.conrelid=v_fk_spec.profile_oid AND c.contype='f'
            AND c.confrelid=v_users_oid
            AND c.conkey=ARRAY[v_fk_spec.user_att,v_fk_spec.role_att]::smallint[]
            AND c.confkey=ARRAY[v_user_id_att,v_user_role_att]::smallint[]
            AND c.confdeltype='c' AND c.confupdtype='a' AND c.confmatchtype='s'
            AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
            AND c.conindid=v_role_key_index_oid
        ) THEN
          RAISE EXCEPTION 'Account/profile migration: % has incorrect columns, target, action, validation or parent index; manual review required',v_fk_spec.constraint_name;
        END IF;
      END LOOP;

      -- These temporary tables are comparison references only. No persistent
      -- table, constraint, function, trigger or migration marker is repaired.
      CREATE TEMP TABLE ustara_ap_expected_customers_checks (
        role VARCHAR(20), first_name VARCHAR(80), last_name VARCHAR(80)
      ) ON COMMIT DROP;
      ALTER TABLE pg_temp.ustara_ap_expected_customers_checks
        ADD CONSTRAINT customers_role_check CHECK (role='customer'),
        ADD CONSTRAINT customers_first_name_nonblank_check CHECK
          (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
        ADD CONSTRAINT customers_last_name_nonblank_check CHECK
          (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0);
      CREATE TEMP TABLE ustara_ap_expected_barbers_checks (
        role VARCHAR(20), first_name VARCHAR(80), last_name VARCHAR(80), specialty VARCHAR(20)
      ) ON COMMIT DROP;
      ALTER TABLE pg_temp.ustara_ap_expected_barbers_checks
        ADD CONSTRAINT barbers_role_check CHECK (role='barber'),
        ADD CONSTRAINT barbers_specialty_check CHECK (specialty IN ('barber','cosmetolog','stylist')),
        ADD CONSTRAINT barbers_first_name_nonblank_check CHECK
          (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
        ADD CONSTRAINT barbers_last_name_nonblank_check CHECK
          (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0);
      v_expected_customer_checks_oid := to_regclass('pg_temp.ustara_ap_expected_customers_checks');
      v_expected_barber_checks_oid := to_regclass('pg_temp.ustara_ap_expected_barbers_checks');
      IF EXISTS (
        SELECT 1 FROM pg_constraint expected
        LEFT JOIN pg_constraint actual ON actual.conrelid=v_customers_oid AND actual.conname=expected.conname
        WHERE expected.conrelid=v_expected_customer_checks_oid AND expected.contype='c'
          AND (actual.oid IS NULL OR actual.contype<>'c' OR NOT actual.convalidated
            OR pg_get_constraintdef(actual.oid,false) IS DISTINCT FROM pg_get_constraintdef(expected.oid,false))
      ) OR EXISTS (
        SELECT 1 FROM pg_constraint expected
        LEFT JOIN pg_constraint actual ON actual.conrelid=v_barbers_oid AND actual.conname=expected.conname
        WHERE expected.conrelid=v_expected_barber_checks_oid AND expected.contype='c'
          AND (actual.oid IS NULL OR actual.contype<>'c' OR NOT actual.convalidated
            OR pg_get_constraintdef(actual.oid,false) IS DISTINCT FROM pg_get_constraintdef(expected.oid,false))
      ) THEN
        RAISE EXCEPTION 'Account/profile migration: a role, name or specialty CHECK definition is missing or incorrect; manual review required';
      END IF;

      v_expected_search_path := format('search_path=%s, pg_catalog, pg_temp',format('%I',v_schema));
      FOR v_function_spec IN
        SELECT * FROM (VALUES
          ('ustara_reject_user_role_change'::text,''::text,'pg_catalog.trigger'::text,
            $src$BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'users.role is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END$src$),
          ('ustara_lock_profile_accounts'::text,''::text,'pg_catalog.trigger'::text,
            $src$DECLARE
    v_ids INTEGER[];
    v_old INTEGER;
    v_new INTEGER;
    v_id INTEGER;
  BEGIN
    IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
      FROM unnest(ARRAY[v_old,v_new]) AS candidates(id) WHERE id IS NOT NULL;
    IF v_ids IS NOT NULL THEN
      FOREACH v_id IN ARRAY v_ids LOOP
        PERFORM id FROM users WHERE id=v_id FOR UPDATE;
      END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END$src$),
          ('ustara_assert_profile_invariant'::text,'integer'::text,'pg_catalog.void'::text,
            $src$DECLARE v_role TEXT; v_customers BIGINT; v_barbers BIGINT;
  BEGIN
    SELECT role INTO v_role FROM users WHERE id=p_user_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT count(*) INTO v_customers FROM customers WHERE user_id=p_user_id;
    SELECT count(*) INTO v_barbers FROM barbers WHERE user_id=p_user_id;
    IF (v_role='customer' AND (v_customers<>1 OR v_barbers<>0))
       OR (v_role='barber' AND (v_barbers<>1 OR v_customers<>0)) THEN
      RAISE EXCEPTION 'Account/profile invariant failed for user %',p_user_id USING ERRCODE='23514';
    END IF;
  END$src$),
          ('ustara_check_profile_invariant_deferred'::text,''::text,'pg_catalog.trigger'::text,
            $src$DECLARE v_old INTEGER; v_new INTEGER;
  BEGIN
    IF TG_TABLE_NAME='users' THEN
      IF TG_OP<>'INSERT' THEN v_old := OLD.id; END IF;
      IF TG_OP<>'DELETE' THEN v_new := NEW.id; END IF;
    ELSE
      IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
      IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
    END IF;
    IF v_old IS NOT NULL THEN PERFORM ustara_assert_profile_invariant(v_old); END IF;
    IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM ustara_assert_profile_invariant(v_new); END IF;
    RETURN NULL;
  END$src$)
        ) AS expected(function_name,identity_arguments,return_type,source_body)
      LOOP
        v_function_oid := to_regprocedure(format('%I.%I(%s)',v_schema,v_function_spec.function_name,
          v_function_spec.identity_arguments))::oid;
        IF v_function_oid IS NULL THEN
          RAISE EXCEPTION 'Account/profile migration: trigger function %.%(% ) is missing; manual review required',
            v_schema,v_function_spec.function_name,v_function_spec.identity_arguments;
        END IF;
        SELECT p.*,l.lanname INTO v_function
        FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
        WHERE p.oid=v_function_oid AND p.pronamespace=to_regnamespace(format('%I',v_schema));
        v_function_definition := pg_get_functiondef(v_function_oid);
        IF v_function.lanname IS DISTINCT FROM 'plpgsql'
           OR v_function.prorettype IS DISTINCT FROM to_regtype(v_function_spec.return_type)
           OR v_function.prokind IS DISTINCT FROM 'f'
           OR v_function.pronargdefaults<>0 OR v_function.provariadic<>0
           OR v_function.proretset OR v_function.proisstrict
           OR v_function.provolatile IS DISTINCT FROM 'v' OR v_function.proparallel IS DISTINCT FROM 'u'
           OR NOT v_function.prosecdef
           OR v_function.proconfig IS DISTINCT FROM ARRAY[v_expected_search_path]::text[]
           OR regexp_replace(v_function.prosrc,'^[[:space:]]+|[[:space:]]+$','','g')
                IS DISTINCT FROM regexp_replace(v_function_spec.source_body,'^[[:space:]]+|[[:space:]]+$','','g')
           OR pg_catalog.strpos(v_function_definition,v_function_spec.source_body)=0
           OR EXISTS (
             SELECT 1 FROM pg_catalog.aclexplode(
               COALESCE(v_function.proacl,pg_catalog.acldefault('f',v_function.proowner))
             ) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
           ) THEN
          RAISE EXCEPTION 'Account/profile migration: trigger function %.% has an incorrect signature, body or security configuration; manual review required',
            v_schema,v_function_spec.function_name;
        END IF;
      END LOOP;

      FOR v_trigger_spec IN
        SELECT * FROM (VALUES
          ('users'::text,v_users_oid,'users_role_immutable_trg'::text,19,
            ARRAY[v_user_role_att]::smallint[],false,NULL::text,'ustara_reject_user_role_change'::text,''::text),
          ('users'::text,v_users_oid,'users_profile_integrity_ct'::text,13,
            ARRAY[]::smallint[],true,'users_profile_integrity_ct'::text,'ustara_check_profile_invariant_deferred'::text,''::text),
          ('customers'::text,v_customers_oid,'customers_profile_integrity_ct'::text,29,
            ARRAY[v_customer_user_att]::smallint[],true,'customers_profile_integrity_ct'::text,'ustara_check_profile_invariant_deferred'::text,''::text),
          ('barbers'::text,v_barbers_oid,'barbers_profile_integrity_ct'::text,29,
            ARRAY[v_barber_user_att]::smallint[],true,'barbers_profile_integrity_ct'::text,'ustara_check_profile_invariant_deferred'::text,''::text),
          ('customers'::text,v_customers_oid,'customers_profile_parent_lock_trg'::text,31,
            ARRAY[]::smallint[],false,NULL::text,'ustara_lock_profile_accounts'::text,''::text),
          ('barbers'::text,v_barbers_oid,'barbers_profile_parent_lock_trg'::text,31,
            ARRAY[]::smallint[],false,NULL::text,'ustara_lock_profile_accounts'::text,''::text)
        ) AS expected(table_name,table_oid,trigger_name,expected_type,expected_attributes,
          is_deferred,constraint_name,function_name,function_arguments)
      LOOP
        v_trigger_constraint_oid := 0;
        IF v_trigger_spec.constraint_name IS NOT NULL THEN
          SELECT c.oid INTO v_trigger_constraint_oid FROM pg_constraint c
          WHERE c.conrelid=v_trigger_spec.table_oid AND c.conname=v_trigger_spec.constraint_name AND c.contype='t';
          IF v_trigger_constraint_oid IS NULL OR NOT EXISTS (
            SELECT 1 FROM pg_constraint c WHERE c.oid=v_trigger_constraint_oid
              AND c.conrelid=v_trigger_spec.table_oid AND c.condeferrable AND c.condeferred
          ) THEN
            RAISE EXCEPTION 'Account/profile migration: deferred constraint trigger % has no correctly configured constraint; manual review required',v_trigger_spec.trigger_name;
          END IF;
        END IF;
        v_function_oid := to_regprocedure(format('%I.%I(%s)',v_schema,v_trigger_spec.function_name,
          v_trigger_spec.function_arguments))::oid;
        SELECT t.oid INTO v_trigger_oid FROM pg_trigger t
        WHERE t.tgrelid=v_trigger_spec.table_oid AND t.tgname=v_trigger_spec.trigger_name;
        IF v_trigger_oid IS NULL OR NOT EXISTS (
          SELECT 1 FROM pg_trigger t
          WHERE t.oid=v_trigger_oid AND t.tgrelid=v_trigger_spec.table_oid
            AND NOT t.tgisinternal AND t.tgparentid=0
            AND t.tgtype=v_trigger_spec.expected_type
            AND ARRAY(
              SELECT actual_attribute.attnum
              FROM unnest(t.tgattr::smallint[]) WITH ORDINALITY
                AS actual_attribute(attnum,ordinality)
              ORDER BY actual_attribute.ordinality
            )=v_trigger_spec.expected_attributes
            AND t.tgenabled='O'
            AND t.tgdeferrable=v_trigger_spec.is_deferred
            AND t.tginitdeferred=v_trigger_spec.is_deferred
            AND t.tgconstraint=v_trigger_constraint_oid
            AND t.tgfoid=v_function_oid
            AND t.tgnargs=0 AND t.tgargs=''::bytea AND t.tgqual IS NULL
        ) THEN
          RAISE EXCEPTION 'Account/profile migration: trigger % has an incorrect table, event, function, constraint or enabled state; manual review required',v_trigger_spec.trigger_name;
        END IF;
      END LOOP;
    END;
    RETURN;
  END IF;

  -- First-run schema creation path begins below. It runs only without the marker.
  SELECT attnum INTO v_user_id_att FROM pg_attribute WHERE attrelid='users'::regclass AND attname='id' AND NOT attisdropped;
  SELECT attnum INTO v_role_att FROM pg_attribute WHERE attrelid='users'::regclass AND attname='role' AND NOT attisdropped;
  SELECT attnum INTO v_customer_user_att FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum INTO v_barber_user_att FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnotnull INTO v_customer_user_not_null FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnotnull INTO v_barber_user_not_null FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='user_id' AND NOT attisdropped;
  IF v_user_id_att IS NULL OR v_role_att IS NULL OR v_customer_user_att IS NULL OR v_barber_user_att IS NULL THEN
    RAISE EXCEPTION 'Account/profile migration: required account/profile columns missing';
  END IF;
  IF NOT v_customer_user_not_null OR NOT v_barber_user_not_null THEN
    RAISE EXCEPTION 'Account/profile migration: profile user_id columns must remain NOT NULL';
  END IF;
  -- The unified-accounts migration creates UNIQUE INDEX objects directly,
  -- rather than UNIQUE constraints. Accept the exact validated index form.
  IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='customers'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=v_customer_user_att)
     OR NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid='barbers'::regclass
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
      AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=v_barber_user_att) THEN
    RAISE EXCEPTION 'Account/profile migration: existing profile UNIQUE(user_id) constraints missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='barbers'::regclass
      AND conname='barbers_specialty_check' AND contype='c' AND convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='barbers'::regclass
      AND attname='specialty' AND attnotnull AND NOT attisdropped)
     OR EXISTS (SELECT 1 FROM barbers WHERE specialty IS NULL OR specialty NOT IN ('barber','cosmetolog','stylist')) THEN
    RAISE EXCEPTION 'Account/profile migration: barber specialty invariant missing or invalid';
  END IF;

  -- Fail closed on existing data; do not guess profile names or repair ownership.
  IF EXISTS (SELECT 1 FROM users u LEFT JOIN customers c ON c.user_id=u.id
             LEFT JOIN barbers b ON b.user_id=u.id
             WHERE (u.role='customer' AND (c.id IS NULL OR b.id IS NOT NULL))
                OR (u.role='barber' AND (b.id IS NULL OR c.id IS NOT NULL)))
     OR EXISTS (SELECT 1 FROM customers c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL OR u.role<>'customer')
     OR EXISTS (SELECT 1 FROM barbers b LEFT JOIN users u ON u.id=b.user_id WHERE u.id IS NULL OR u.role<>'barber') THEN
    RAISE EXCEPTION 'Account/profile migration: existing account/profile mismatch; review data before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM customers WHERE first_name IS NULL OR last_name IS NULL
      OR length(btrim(first_name, U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0
      OR length(btrim(last_name, U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0)
     OR EXISTS (SELECT 1 FROM barbers WHERE first_name IS NULL OR last_name IS NULL
      OR length(btrim(first_name, U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0
      OR length(btrim(last_name, U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0) THEN
    RAISE EXCEPTION 'Account/profile migration: existing profile names are NULL, blank or Unicode whitespace; reviewed cleanup required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND contype='u'
      AND conkey=ARRAY[v_user_id_att,v_role_att]::smallint[]) THEN
    ALTER TABLE users ADD CONSTRAINT users_id_role_key UNIQUE (id,role);
  END IF;

  FOREACH v_table IN ARRAY ARRAY['customers','barbers'] LOOP
    v_att := CASE WHEN v_table='customers' THEN v_customer_user_att ELSE v_barber_user_att END;
    v_fk_count := 0;
    FOR v_fk IN
      SELECT c.conname,c.conkey,c.confkey,c.confrelid,c.confdeltype,c.convalidated
      FROM pg_constraint c
      WHERE c.conrelid=to_regclass(format('%I.%I',v_schema,v_table)) AND c.contype='f'
        AND v_att=ANY(c.conkey)
    LOOP
      IF v_fk.confrelid<>'users'::regclass OR v_fk.conkey<>ARRAY[v_att]::smallint[]
         OR v_fk.confkey<>ARRAY[v_user_id_att]::smallint[] OR NOT v_fk.convalidated OR v_fk.confdeltype<>'a' THEN
        RAISE EXCEPTION 'Account/profile migration: unexpected FK involving %.user_id',v_table;
      END IF;
      v_fk_count := v_fk_count+1;
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',v_schema,v_table,v_fk.conname);
    END LOOP;
    IF v_fk_count<>1 THEN RAISE EXCEPTION 'Account/profile migration: expected exactly one old user_id FK on %',v_table; END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='customers'::regclass AND attname='role' AND NOT attisdropped)
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='barbers'::regclass AND attname='role' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Account/profile migration: untracked profile role discriminator exists';
  END IF;
  ALTER TABLE customers ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'customer',
    ADD CONSTRAINT customers_role_check CHECK (role='customer');
  ALTER TABLE barbers ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'barber',
    ADD CONSTRAINT barbers_role_check CHECK (role='barber');

  ALTER TABLE customers ALTER COLUMN first_name SET NOT NULL, ALTER COLUMN last_name SET NOT NULL;
  ALTER TABLE barbers ALTER COLUMN first_name SET NOT NULL, ALTER COLUMN last_name SET NOT NULL;
  ALTER TABLE customers ADD CONSTRAINT customers_first_name_nonblank_check CHECK
    (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
    ADD CONSTRAINT customers_last_name_nonblank_check CHECK
    (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0);
  ALTER TABLE barbers ADD CONSTRAINT barbers_first_name_nonblank_check CHECK
    (length(btrim(first_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0),
    ADD CONSTRAINT barbers_last_name_nonblank_check CHECK
    (length(btrim(last_name,U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0);

  ALTER TABLE customers ADD CONSTRAINT customers_user_role_fkey
    FOREIGN KEY(user_id,role) REFERENCES users(id,role) ON DELETE CASCADE;
  ALTER TABLE barbers ADD CONSTRAINT barbers_user_role_fkey
    FOREIGN KEY(user_id,role) REFERENCES users(id,role) ON DELETE CASCADE;

  CREATE FUNCTION ustara_reject_user_role_change() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'users.role is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END $fn$;

  CREATE FUNCTION ustara_lock_profile_accounts() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  DECLARE
    v_ids INTEGER[];
    v_old INTEGER;
    v_new INTEGER;
    v_id INTEGER;
  BEGIN
    IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
    SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
      FROM unnest(ARRAY[v_old,v_new]) AS candidates(id) WHERE id IS NOT NULL;
    IF v_ids IS NOT NULL THEN
      FOREACH v_id IN ARRAY v_ids LOOP
        PERFORM id FROM users WHERE id=v_id FOR UPDATE;
      END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END $fn$;

  CREATE FUNCTION ustara_assert_profile_invariant(p_user_id INTEGER) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  DECLARE v_role TEXT; v_customers BIGINT; v_barbers BIGINT;
  BEGIN
    SELECT role INTO v_role FROM users WHERE id=p_user_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT count(*) INTO v_customers FROM customers WHERE user_id=p_user_id;
    SELECT count(*) INTO v_barbers FROM barbers WHERE user_id=p_user_id;
    IF (v_role='customer' AND (v_customers<>1 OR v_barbers<>0))
       OR (v_role='barber' AND (v_barbers<>1 OR v_customers<>0)) THEN
      RAISE EXCEPTION 'Account/profile invariant failed for user %',p_user_id USING ERRCODE='23514';
    END IF;
  END $fn$;

  CREATE FUNCTION ustara_check_profile_invariant_deferred() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  DECLARE v_old INTEGER; v_new INTEGER;
  BEGIN
    IF TG_TABLE_NAME='users' THEN
      IF TG_OP<>'INSERT' THEN v_old := OLD.id; END IF;
      IF TG_OP<>'DELETE' THEN v_new := NEW.id; END IF;
    ELSE
      IF TG_OP<>'INSERT' THEN v_old := OLD.user_id; END IF;
      IF TG_OP<>'DELETE' THEN v_new := NEW.user_id; END IF;
    END IF;
    IF v_old IS NOT NULL THEN PERFORM ustara_assert_profile_invariant(v_old); END IF;
    IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM ustara_assert_profile_invariant(v_new); END IF;
    RETURN NULL;
  END $fn$;

  CREATE TRIGGER users_role_immutable_trg BEFORE UPDATE OF role ON users
    FOR EACH ROW EXECUTE FUNCTION ustara_reject_user_role_change();
  CREATE TRIGGER customers_profile_parent_lock_trg BEFORE INSERT OR UPDATE OR DELETE ON customers
    FOR EACH ROW EXECUTE FUNCTION ustara_lock_profile_accounts();
  CREATE TRIGGER barbers_profile_parent_lock_trg BEFORE INSERT OR UPDATE OR DELETE ON barbers
    FOR EACH ROW EXECUTE FUNCTION ustara_lock_profile_accounts();
  CREATE CONSTRAINT TRIGGER users_profile_integrity_ct AFTER INSERT OR DELETE ON users
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();
  CREATE CONSTRAINT TRIGGER customers_profile_integrity_ct AFTER INSERT OR DELETE OR UPDATE OF user_id ON customers
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();
  CREATE CONSTRAINT TRIGGER barbers_profile_integrity_ct AFTER INSERT OR DELETE OR UPDATE OF user_id ON barbers
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ustara_check_profile_invariant_deferred();

  REVOKE ALL ON FUNCTION ustara_reject_user_role_change() FROM PUBLIC;
  REVOKE ALL ON FUNCTION ustara_lock_profile_accounts() FROM PUBLIC;
  REVOKE ALL ON FUNCTION ustara_assert_profile_invariant(INTEGER) FROM PUBLIC;
  REVOKE ALL ON FUNCTION ustara_check_profile_invariant_deferred() FROM PUBLIC;

  -- Advance the current OTP catalog snapshot. Historical archive layers remain
  -- intact; the specialty migration is intentionally a stage-only migration.
  FOREACH v_object IN ARRAY ARRAY['users','customers','barbers','admin_accounts','ustara_schema_migrations',
    'registration_phone_limits','pending_registrations','registration_otp_history',
    'registration_security_events','registration_admin_actions'] LOOP
    EXECUTE format('LOCK TABLE ONLY %I.%I IN ACCESS SHARE MODE',v_schema,v_object);
    v_table_oid := to_regclass(format('%I.%I',v_schema,v_object));
    SELECT jsonb_build_object(
      'table',jsonb_build_object('kind',c.relkind,'persistence',c.relpersistence,
        'row_security',c.relrowsecurity,'force_row_security',c.relforcerowsecurity,'options',c.reloptions),
      'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'position',a.attnum,
        'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,
        'generated',a.attgenerated,'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE a.attcollation::regcollation::text END,
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum),'[]'::jsonb)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=v_table_oid AND a.attnum>0 AND NOT a.attisdropped),
      'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,
        'definition',pg_get_constraintdef(k.oid,false),'validated',k.convalidated,
        'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname),'[]'::jsonb)
        FROM pg_constraint k WHERE k.conrelid=v_table_oid),
      'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),
        'unique',i.indisunique,'primary',i.indisprimary,'valid',i.indisvalid,'ready',i.indisready,
        'live',i.indislive,'exclusion',i.indisexclusion,'options',ic.reloptions) ORDER BY ic.relname),'[]'::jsonb)
        FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=v_table_oid)
    ) INTO v_signature FROM pg_class c WHERE c.oid=v_table_oid;
    IF v_signature IS NULL THEN RAISE EXCEPTION 'Account/profile migration: baseline table % missing',v_object; END IF;
    v_manifest := v_manifest || jsonb_build_object(v_object,v_signature);
  END LOOP;
  v_archive_text := obj_description(to_regclass(format('%I.registration_phone_limits',v_schema)),'pg_class');
  BEGIN
    v_archive := v_archive_text::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Account/profile migration: OTP baseline is malformed';
  END;
  IF v_archive->>'version' IS DISTINCT FROM '20261114_otp_registration'
     OR v_archive->>'format' IS DISTINCT FROM '1'
     OR (SELECT count(*) FROM jsonb_object_keys(v_archive->'tables'))<>10 THEN
    RAISE EXCEPTION 'Account/profile migration: OTP baseline is incompatible; manual review required';
  END IF;
  EXECUTE format('COMMENT ON TABLE %I.registration_phone_limits IS %L',v_schema,
    jsonb_set(v_archive,'{tables}',v_manifest,false)::text);

  INSERT INTO ustara_schema_migrations(version) VALUES(v_version);
END $$;

COMMIT;
