-- Final inventory/data checks. Owner migrations validate their live manifests.
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  expected_tables CONSTANT TEXT[] := ARRAY[
    'users','customers','barbers','services','barber_working_hours','bookings',
    'admin_accounts','ustara_schema_migrations','registration_phone_limits',
    'pending_registrations','registration_otp_history','registration_security_events',
    'registration_admin_actions','login_attempt_limits','account_session_versions',
    'password_reset_limits','password_reset_requests','password_reset_events',
    'barber_telegram_links','barber_telegram_link_tokens','telegram_bot_state',
    'ustara_media','social_posts','social_comments','social_likes','social_saves',
    'social_follows','social_reports','barber_reviews','telegram_otp_contacts','telegram_registration_requests',
    'otp_request_limits','telegram_webhook_receipts',
    'barber_promotions','phone_change_requests','phone_change_notices','booking_services',
    'manual_recovery_cases','manual_recovery_events','account_device_sessions','booking_request_keys','barber_calendar_exceptions','barber_weekly_breaks','barber_date_breaks','walkin_queue','walkin_queue_events','walkin_qr_tokens','walkin_qr_requests','walkin_qr_request_events','walkin_queue_reorder_events','walkin_qr_settings','walkin_qr_settings_events',
    'walkin_queue_telegram_invites','walkin_queue_telegram_subscriptions','walkin_queue_notification_outbox','smart_booking_openings','smart_booking_offers','smart_booking_confirmations','smart_booking_telegram_outbox','walkin_manual_claims','barber_day_closures','barber_day_close_events','profile_issue_reports','smart_booking_admin_settings','smart_booking_admin_settings_events','customer_barber_chat_threads','customer_barber_chat_messages','barber_evidence_badges','barber_badge_audit_events','booking_late_notices','booking_checkins','barber_owned_shops','shop_gallery_posts','booking_private_notes','barber_phone_booking_invites','admin_account_suspension_events','admin_suspension_booking_cases','admin_suspension_booking_case_events','admin_suspension_telegram_notices','customer_telegram_links','customer_telegram_link_tokens','customer_booking_telegram_outbox'];
  expected_versions CONSTANT TEXT[] := ARRAY[
    '20261113_00_users_foundation','20261113_unified_accounts',
    '20261113_unified_accounts_02_admin_accounts','20261114_otp_registration',
    '20261114_otp_registration_02_profile_names','20261114_otp_registration_03_barber_specialty',
    '20261114_security_01_login_protection','20261114_security_02_password_reset',
    '20261114_slots_01_booking_duration','20261114_telegram_01_barber_links',
    '20261115_slots_02_booking_no_overlap','20261116_account_profile_deletion_integrity',
    '20261117_barber_profile','20261117_barber_profile_02_booking_acceptance',
    '20261118_social_portfolio_reviews','20261119_telegram_otp_delivery','20261120_telegram_registration_requests',
    '20261121_telegram_auth_hardening','20261122_telegram_phone_requests',
    '20261123_admin_promotions','20261123_registration_resend_cooldown',
    '20261123_security_login_policy','20261124_phone_change','20261125_multi_service_bookings','20261126_account_pause',
    '20261127_manual_account_recovery','20261128_device_sessions','20261129_booking_idempotency',
    '20261130_customer_time_overlap','20261201_cancellation_policy','20261202_barber_calendar_exceptions','20261203_barber_break_rules','20261204_walkin_queue_core','20261205_walkin_qr_approval','20261206_queue_order_qr_settings','20261207_queue_telegram_notifications','20261208_smart_booking_offers','20261209_smart_booking_confirmation','20261210_manual_queue_claims','20261211_smart_booking_active_entry','20261212_queue_self_exit_audit','20261213_queue_delivery_uncertain','20261214_walkin_service_started','20261215_walkin_arrived','20261216_safe_day_close','20261217_profile_issue_reports','20261218_smart_booking_admin_rules','20261219_customer_barber_chat','20261220_barber_evidence_badges','20261221_social_comment_pins','20261222_portfolio_featured_posts','20261223_booking_late_notices','20261224_booking_customer_checkins','20261225_barber_self_reported_certificates','20261226_single_address_barber_shops','20261227_shop_gallery_posts','20261228_private_booking_notes','20261229_barber_phone_booking_invites','20261230_admin_account_suspensions','20261231_admin_suspension_booking_cases','20270101_admin_suspension_telegram_notices','20270102_customer_telegram_opt_in','20270103_customer_booking_telegram_outbox'];
  object_name TEXT;
  versions TEXT[];
  row_count BIGINT;
  bookings_oid OID;
  btree_gist_oid OID;
  gist_int4_ops_oid OID;
  expected_constraint_oid OID;
  actual_constraint_definition TEXT;
  expected_constraint_definition TEXT;
BEGIN
  IF (SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C")
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=schema_name AND c.relkind IN ('r','p','v','m','f')) IS DISTINCT FROM
       (SELECT array_agg(name ORDER BY name COLLATE "C") FROM unnest(expected_tables) AS t(name)) THEN
    RAISE EXCEPTION 'Fresh bootstrap: final table inventory mismatch';
  END IF;
  EXECUTE format('SELECT array_agg(version ORDER BY version) FROM %I.ustara_schema_migrations',schema_name) INTO versions;
  IF versions IS DISTINCT FROM (SELECT array_agg(name ORDER BY name) FROM unnest(expected_versions) AS t(name)) THEN
    RAISE EXCEPTION 'Fresh bootstrap: migration history mismatch';
  END IF;
  -- v173 #124: gallery must keep bounded ordered positions and cascade stale posts.
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.shop_gallery_posts',schema_name))
      AND c.contype='p' AND c.convalidated)
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid=pg_catalog.to_regclass(format('%I.shop_gallery_posts',schema_name))
         AND c.contype='u' AND c.convalidated)
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
       WHERE c.conrelid=pg_catalog.to_regclass(format('%I.shop_gallery_posts',schema_name))
         AND c.contype='f' AND c.convalidated) <> 2
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
       WHERE c.conrelid=pg_catalog.to_regclass(format('%I.shop_gallery_posts',schema_name))
         AND c.contype='c' AND c.convalidated)
  THEN RAISE EXCEPTION 'Fresh bootstrap: shop gallery integrity missing'; END IF;
  -- v172 #119/#120: single-owner shop record with one address and public toggle.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=pg_catalog.to_regclass(format('%I.barber_owned_shops',schema_name))
      AND c.contype='u' AND c.convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=pg_catalog.to_regclass(format('%I.barber_owned_shops',schema_name))
      AND c.contype='f' AND c.confrelid=pg_catalog.to_regclass(format('%I.barbers',schema_name)) AND c.convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass(format('%I.barber_owned_shops',schema_name))
      AND a.attname='address' AND a.attnotnull AND NOT a.attisdropped)
  THEN RAISE EXCEPTION 'Fresh bootstrap: single-address shop integrity missing'; END IF;
  -- v171 #109: self-reported certificates are a bounded, non-verified JSON array.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass(format('%I.barbers',schema_name)) AND a.attname='certificates' AND a.atttypid='jsonb'::regtype AND a.attnotnull AND NOT a.attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid=pg_catalog.to_regclass(format('%I.barbers',schema_name)) AND c.conname='barbers_certificates_array_v171' AND c.contype='c' AND c.convalidated)
  THEN RAISE EXCEPTION 'Fresh bootstrap: certificates schema missing'; END IF;
  -- v169 #101: late arrival notices are booking-bound, unique, and time-audited.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.booking_late_notices',schema_name))
      AND c.contype='p' AND c.convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.booking_late_notices',schema_name))
      AND c.contype='f' AND c.convalidated
      AND c.confrelid=pg_catalog.to_regclass(format('%I.bookings',schema_name))
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.booking_late_notices',schema_name))
      AND c.contype='c' AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%minutes_late%'
  ) THEN RAISE EXCEPTION 'Fresh bootstrap: late-notice integrity missing'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid=pg_catalog.to_regclass(format('%I.social_comments',schema_name))
      AND a.attname='pinned' AND a.atttypid='boolean'::regtype AND a.attnotnull AND NOT a.attisdropped
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
    WHERE i.indrelid=pg_catalog.to_regclass(format('%I.social_comments',schema_name))
      AND idx.relname='social_comments_one_pinned_v167_idx' AND i.indisunique
      AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
  ) THEN RAISE EXCEPTION 'Fresh bootstrap: social pinned comment integrity missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid=pg_catalog.to_regclass(format('%I.social_posts',schema_name))
        AND a.attname='featured_at' AND a.atttypid='timestamptz'::regtype AND NOT a.attisdropped)
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
       WHERE i.indrelid=pg_catalog.to_regclass(format('%I.social_posts',schema_name))
         AND idx.relname='social_posts_featured_v168_idx' AND i.indisvalid AND i.indisready)
  THEN RAISE EXCEPTION 'Fresh bootstrap: featured portfolio integrity missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
    WHERE i.indrelid=pg_catalog.to_regclass(format('%I.profile_issue_reports',schema_name))
      AND idx.relname='profile_issue_one_pending_per_reason'
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
  ) THEN RAISE EXCEPTION 'Fresh bootstrap: pending profile report uniqueness missing'; END IF;
  IF pg_catalog.to_regprocedure(format('%I.ustara_effective_day_schedule(integer,date)',schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: calendar schedule function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.barber_day_closures',schema_name))
      AND c.conname='barber_day_closures_state' AND c.contype='c' AND c.convalidated)
  THEN RAISE EXCEPTION 'Fresh bootstrap: safe day closure state constraint missing'; END IF;
  IF pg_catalog.to_regprocedure(format('%I.ustara_effective_breaks(integer,date)',schema_name)) IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: unified break function missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname=schema_name AND r.relname='barber_calendar_exceptions'
      AND c.conname='barber_calendar_exception_values' AND c.contype='c' AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: calendar exception validation missing';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname=schema_name AND r.relname='walkin_queue_events'
      AND c.conname='walkin_queue_event_actor_source' AND c.contype='c' AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: queue self-exit audit constraint missing';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass(format('%I.walkin_queue_notification_outbox',schema_name))
      AND c.conname='walkin_queue_notification_delivery_status'
      AND c.contype='c' AND c.convalidated
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%uncertain%'
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: queue Telegram uncertain-delivery constraint missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
    WHERE i.indrelid=pg_catalog.to_regclass(format('%I.walkin_queue',schema_name))
      AND idx.relname='walkin_queue_one_called_per_day'
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: queue one-called-per-day unique index missing';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=pg_catalog.to_regclass(format('%I.walkin_queue',schema_name))
       AND a.attname='started_at' AND a.atttypid='timestamptz'::regtype AND NOT a.attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=pg_catalog.to_regclass(format('%I.walkin_queue',schema_name))
       AND a.attname='arrived_at' AND a.atttypid='timestamptz'::regtype AND NOT a.attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
     WHERE c.conrelid=pg_catalog.to_regclass(format('%I.walkin_queue',schema_name))
       AND c.conname='walkin_queue_state_dates' AND c.convalidated
       AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%arrived%')
  THEN
    RAISE EXCEPTION 'Fresh bootstrap: arrival/service state missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
    WHERE i.indrelid=pg_catalog.to_regclass(format('%I.smart_booking_offers',schema_name))
      AND idx.relname='smart_booking_one_active_entry'
      AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: Smart Booking active-entry index missing';
  END IF;
  IF (SELECT count(*) FROM smart_booking_admin_settings WHERE id=1 AND enabled AND revision=1)<>1
     OR (SELECT count(*) FROM smart_booking_admin_settings)<>1
  THEN RAISE EXCEPTION 'Fresh bootstrap: Smart Booking enabled singleton missing'; END IF;
  FOREACH object_name IN ARRAY expected_tables LOOP
    IF object_name IN ('admin_accounts','ustara_schema_migrations','smart_booking_admin_settings') THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %I.%I',schema_name,object_name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'Fresh bootstrap: unexpected data in %',object_name; END IF;
  END LOOP;
  EXECUTE format('SELECT count(*) FROM %I.admin_accounts WHERE id=1 AND is_active',schema_name) INTO row_count;
  IF row_count<>1 THEN RAISE EXCEPTION 'Fresh bootstrap: active singleton admin missing'; END IF;
  SELECT e.oid INTO btree_gist_oid
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='btree_gist' AND n.nspname='public';
  IF btree_gist_oid IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: prerequisite missing; btree_gist must be installed in public';
  END IF;
  SELECT opc.oid INTO gist_int4_ops_oid
  FROM pg_catalog.pg_opclass opc
  JOIN pg_catalog.pg_namespace n ON n.oid=opc.opcnamespace
  JOIN pg_catalog.pg_am am ON am.oid=opc.opcmethod
  WHERE n.nspname='public' AND opc.opcname='gist_int4_ops'
    AND am.amname='gist' AND opc.opcintype='integer'::regtype
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid='pg_catalog.pg_opclass'::pg_catalog.regclass
        AND d.objid=opc.oid AND d.objsubid=0
        AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
        AND d.refobjid=btree_gist_oid AND d.deptype='e'
    );
  IF gist_int4_ops_oid IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: prerequisite missing; public.gist_int4_ops must be owned by btree_gist';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=schema_name AND NOT c.convalidated)
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class r ON r.oid=i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname=schema_name
      AND (NOT i.indisvalid OR NOT i.indisready OR NOT i.indislive)) THEN
    RAISE EXCEPTION 'Fresh bootstrap: invalid constraint/index';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class r ON r.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname=schema_name AND r.relname='bookings'
      AND c.conname='bookings_active_time_excl' AND c.contype='x' AND c.convalidated
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: active booking exclusion constraint missing';
  END IF;
  bookings_oid := pg_catalog.to_regclass(format('%I.bookings',schema_name));
  EXECUTE format('CREATE TEMP TABLE %I ON COMMIT DROP AS
    SELECT barber_id, booking_time, duration_minutes, status FROM %I.bookings WITH NO DATA',
    'ustara_booking_overlap_verify_expected',schema_name);
  EXECUTE $ddl$
    ALTER TABLE pg_temp.ustara_booking_overlap_verify_expected
    ADD CONSTRAINT bookings_active_time_excl
    EXCLUDE USING gist (
      barber_id public.gist_int4_ops WITH =,
      (tsrange(booking_time AT TIME ZONE 'UTC',
        (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
    ) WHERE (status IN ('pending','confirmed'))
  $ddl$;
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false)
    INTO expected_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid=pg_catalog.to_regclass('pg_temp.ustara_booking_overlap_verify_expected')
    AND c.conname='bookings_active_time_excl' AND c.contype='x';
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false)
    INTO actual_constraint_definition
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid=bookings_oid AND c.conname='bookings_active_time_excl' AND c.contype='x';
  IF expected_constraint_definition IS NULL
     OR actual_constraint_definition IS DISTINCT FROM expected_constraint_definition THEN
    RAISE EXCEPTION 'Fresh bootstrap: active booking exclusion constraint definition mismatch';
  END IF;
  -- Also verify that a customer cannot have overlapping appointments at two
  -- barbers. Canonical comparison matches the forward-only migration.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_index i ON i.indexrelid=c.conindid
      WHERE c.conrelid=bookings_oid AND c.conname='bookings_customer_time_excl'
        AND c.contype='x' AND c.convalidated
        AND i.indisvalid AND i.indisready AND i.indislive) THEN
    RAISE EXCEPTION 'Fresh bootstrap: customer overlap exclusion constraint missing';
  END IF;
  EXECUTE format('CREATE TEMP TABLE ustara_customer_overlap_verify_expected ON COMMIT DROP AS
    SELECT customer_id,booking_time,duration_minutes,status FROM %I.bookings WITH NO DATA',schema_name);
  EXECUTE $ddl$
    ALTER TABLE pg_temp.ustara_customer_overlap_verify_expected
    ADD CONSTRAINT bookings_customer_time_excl
    EXCLUDE USING gist (
      customer_id public.gist_int4_ops WITH =,
      (tsrange(booking_time AT TIME ZONE 'UTC',
        (booking_time AT TIME ZONE 'UTC') + duration_minutes * interval '1 minute', '[)')) WITH &&
    ) WHERE (status IN ('pending','confirmed'))
  $ddl$;
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false) INTO expected_constraint_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass('pg_temp.ustara_customer_overlap_verify_expected')
      AND c.conname='bookings_customer_time_excl' AND c.contype='x';
  SELECT pg_catalog.pg_get_constraintdef(c.oid,false) INTO actual_constraint_definition
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=bookings_oid AND c.conname='bookings_customer_time_excl' AND c.contype='x';
  IF expected_constraint_definition IS NULL
     OR actual_constraint_definition IS DISTINCT FROM expected_constraint_definition THEN
    RAISE EXCEPTION 'Fresh bootstrap: customer overlap exclusion constraint definition mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname=schema_name AND r.relname='users' AND c.conname='users_id_role_key' AND c.contype='u')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname=schema_name AND r.relname='customers' AND c.conname='customers_user_role_fkey'
        AND c.contype='f' AND c.confdeltype='c' AND c.convalidated)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      WHERE n.nspname=schema_name AND r.relname='barbers' AND c.conname='barbers_user_role_fkey'
        AND c.contype='f' AND c.confdeltype='c' AND c.convalidated)
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND r.relname='customers' AND c.contype='c'
           AND c.conname IN ('customers_role_check','customers_first_name_nonblank_check','customers_last_name_nonblank_check')
           AND c.convalidated)<>3
     OR (SELECT count(*) FROM pg_catalog.pg_constraint c
         JOIN pg_catalog.pg_class r ON r.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND r.relname='barbers' AND c.contype='c'
           AND c.conname IN ('barbers_role_check','barbers_first_name_nonblank_check','barbers_last_name_nonblank_check')
           AND c.convalidated)<>3
     OR (SELECT count(*) FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND NOT t.tgisinternal AND t.tgdeferrable AND t.tginitdeferred
           AND t.tgname IN ('users_profile_integrity_ct','customers_profile_integrity_ct','barbers_profile_integrity_ct'))<>3
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND r.relname='users' AND t.tgname='users_role_immutable_trg' AND NOT t.tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND r.relname='customers' AND t.tgname='customers_profile_parent_lock_trg' AND NOT t.tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
         WHERE n.nspname=schema_name AND r.relname='barbers' AND t.tgname='barbers_profile_parent_lock_trg' AND NOT t.tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
         WHERE a.attrelid=pg_catalog.to_regclass(format('%I.customers',schema_name))
           AND a.attname IN ('first_name','last_name') AND a.attnotnull GROUP BY a.attrelid HAVING count(*)=2)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
         WHERE a.attrelid=pg_catalog.to_regclass(format('%I.barbers',schema_name))
           AND a.attname IN ('first_name','last_name') AND a.attnotnull GROUP BY a.attrelid HAVING count(*)=2) THEN
    RAISE EXCEPTION 'Fresh bootstrap: account/profile integrity objects missing or incompatible';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
    JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=schema_name AND r.relname='barbers' AND a.attname='accepting_bookings'
      AND a.atttypid='boolean'::regtype AND a.attnotnull
      AND pg_catalog.pg_get_expr(d.adbin,d.adrelid)='true'
  ) THEN
    RAISE EXCEPTION 'Fresh bootstrap: barbers.accepting_bookings ustuni noto‘g‘ri';
  END IF;
  -- Manual links are opt-in only and never retain a reusable code after claim.
  IF pg_catalog.to_regclass(format('%I.walkin_manual_claims',schema_name)) IS NULL
    OR NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261210_manual_queue_claims')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid=pg_catalog.to_regclass(format('%I.walkin_manual_claims',schema_name))
        AND c.conname='walkin_manual_no_reusable_secret' AND c.convalidated) THEN
    RAISE EXCEPTION 'Fresh bootstrap: v29 manual claim consent missing';
  END IF;
  -- Cancellation terms must be stored at booking creation (not refreshed on
  -- barber policy edits), and the trigger may not be disabled silently.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class r ON r.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname=schema_name AND r.relname='bookings'
        AND t.tgname='bookings_cancellation_terms_on_insert'
        AND t.tgenabled='O' AND NOT t.tgisinternal AND (t.tgtype::integer & 7)=7
        AND p.proname='ustara_snapshot_cancellation_terms')
      OR (SELECT count(*) FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class r ON r.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=r.relnamespace
        WHERE n.nspname=schema_name AND r.relname IN ('barbers','bookings')
          AND a.attname IN ('cancellation_cutoff_minutes','cancellation_policy_text')
          AND a.attnum>0 AND NOT a.attisdropped)<>4 THEN
    RAISE EXCEPTION 'Fresh bootstrap: cancellation policy columns/trigger missing';
  END IF;
  -- #102 check-in table required by booking read projections.
  IF pg_catalog.to_regclass(format('%I.booking_checkins',schema_name)) IS NULL
    OR NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261224_booking_customer_checkins') THEN
    RAISE EXCEPTION 'Fresh bootstrap: booking check-in table is missing';
  END IF;
END $$;
SELECT pg_catalog.pg_advisory_unlock(pg_catalog.hashtext(pg_catalog.current_database()),
  pg_catalog.hashtext('ustara-schema-ddl:' || pg_catalog.current_schema()));
