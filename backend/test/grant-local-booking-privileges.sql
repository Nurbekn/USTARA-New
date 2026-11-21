\set ON_ERROR_STOP on

-- Run only with psql, connected as postgres directly to ustara_test_db.
-- Grants are limited to the listed public tables. No sequence privileges,
-- ownership changes, schema changes, or data changes are performed.
BEGIN;

DO $preflight$
DECLARE
  missing_object text;
BEGIN
  IF current_database() <> 'ustara_test_db' THEN
    RAISE EXCEPTION 'Refusing privilege changes outside ustara_test_db';
  END IF;

  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this script as postgres, the expected table owner';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'ustara_test_owner') THEN
    RAISE EXCEPTION 'Required role ustara_test_owner does not exist';
  END IF;

  IF NOT pg_catalog.has_database_privilege('ustara_test_owner', current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'ustara_test_owner lacks CONNECT on ustara_test_db; no table grants applied';
  END IF;

  IF NOT pg_catalog.has_schema_privilege('ustara_test_owner', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'ustara_test_owner lacks USAGE on public; no table grants applied';
  END IF;

  SELECT required.table_name
    INTO missing_object
  FROM (VALUES
    ('users'), ('customers'), ('barbers'), ('services'), ('barber_working_hours'),
    ('bookings'), ('admin_accounts'), ('ustara_schema_migrations'),
    ('registration_phone_limits'), ('pending_registrations'), ('registration_otp_history'),
    ('registration_security_events'), ('registration_admin_actions'), ('login_attempt_limits'),
    ('account_session_versions'), ('password_reset_limits'), ('password_reset_requests'),
    ('password_reset_events'), ('barber_telegram_links'), ('barber_telegram_link_tokens'),
    ('telegram_bot_state')
  ) AS required(table_name)
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = required.table_name
   AND relation.relkind IN ('r', 'p')
  WHERE relation.oid IS NULL
  ORDER BY required.table_name
  LIMIT 1;

  IF missing_object IS NOT NULL THEN
    RAISE EXCEPTION 'Required public table is missing: %', missing_object;
  END IF;

  SELECT required.table_name
    INTO missing_object
  FROM (VALUES
    ('users'), ('customers'), ('barbers'), ('services'), ('barber_working_hours'),
    ('bookings'), ('admin_accounts'), ('ustara_schema_migrations'),
    ('registration_phone_limits'), ('pending_registrations'), ('registration_otp_history'),
    ('registration_security_events'), ('registration_admin_actions'), ('login_attempt_limits'),
    ('account_session_versions'), ('password_reset_limits'), ('password_reset_requests'),
    ('password_reset_events'), ('barber_telegram_links'), ('barber_telegram_link_tokens'),
    ('telegram_bot_state')
  ) AS required(table_name)
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.nspname = 'public'
  JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = namespace.oid
   AND relation.relname = required.table_name
   AND relation.relkind IN ('r', 'p')
  WHERE pg_catalog.pg_get_userbyid(relation.relowner) <> 'postgres'
  ORDER BY required.table_name
  LIMIT 1;

  IF missing_object IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected owner for public table: %', missing_object;
  END IF;
END
$preflight$;

GRANT SELECT ON TABLE
  public.users,
  public.customers,
  public.barbers,
  public.services,
  public.barber_working_hours,
  public.bookings,
  public.admin_accounts,
  public.ustara_schema_migrations,
  public.registration_phone_limits,
  public.pending_registrations,
  public.registration_otp_history,
  public.registration_security_events,
  public.registration_admin_actions,
  public.login_attempt_limits,
  public.account_session_versions,
  public.password_reset_limits,
  public.password_reset_requests,
  public.password_reset_events,
  public.barber_telegram_links,
  public.barber_telegram_link_tokens,
  public.telegram_bot_state
TO ustara_test_owner;

GRANT INSERT, DELETE ON TABLE
  public.users,
  public.customers,
  public.barbers,
  public.barber_working_hours,
  public.barber_telegram_links
TO ustara_test_owner;

-- Booking creation uses SELECT ... FOR SHARE on barbers, which requires UPDATE
-- on at least one column. Grant only on non-security metadata for this test role.
GRANT UPDATE (created_at) ON TABLE public.barbers TO ustara_test_owner;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.services,
  public.bookings
TO ustara_test_owner;

GRANT DELETE ON TABLE public.account_session_versions TO ustara_test_owner;

DO $verify$
DECLARE
  missing_privilege record;
BEGIN
  SELECT required.table_name, required.privilege
    INTO missing_privilege
  FROM (VALUES
    ('users', 'SELECT'), ('users', 'INSERT'), ('users', 'DELETE'),
    ('customers', 'SELECT'), ('customers', 'INSERT'), ('customers', 'DELETE'),
    ('barbers', 'SELECT'), ('barbers', 'INSERT'), ('barbers', 'DELETE'), ('barbers', 'UPDATE'),
    ('services', 'SELECT'), ('services', 'INSERT'), ('services', 'UPDATE'), ('services', 'DELETE'),
    ('barber_working_hours', 'SELECT'), ('barber_working_hours', 'INSERT'), ('barber_working_hours', 'DELETE'),
    ('bookings', 'SELECT'), ('bookings', 'INSERT'), ('bookings', 'UPDATE'), ('bookings', 'DELETE'),
    ('admin_accounts', 'SELECT'), ('ustara_schema_migrations', 'SELECT'),
    ('registration_phone_limits', 'SELECT'), ('pending_registrations', 'SELECT'),
    ('registration_otp_history', 'SELECT'), ('registration_security_events', 'SELECT'),
    ('registration_admin_actions', 'SELECT'), ('login_attempt_limits', 'SELECT'),
    ('account_session_versions', 'SELECT'), ('account_session_versions', 'DELETE'),
    ('password_reset_limits', 'SELECT'), ('password_reset_requests', 'SELECT'),
    ('password_reset_events', 'SELECT'),
    ('barber_telegram_links', 'SELECT'), ('barber_telegram_links', 'INSERT'), ('barber_telegram_links', 'DELETE'),
    ('barber_telegram_link_tokens', 'SELECT'), ('telegram_bot_state', 'SELECT')
  ) AS required(table_name, privilege)
  WHERE NOT CASE
    WHEN required.table_name = 'barbers' AND required.privilege = 'UPDATE'
      THEN pg_catalog.has_any_column_privilege(
        'ustara_test_owner', pg_catalog.format('%I.%I', 'public', required.table_name), 'UPDATE'
      )
    ELSE pg_catalog.has_table_privilege(
      'ustara_test_owner',
      pg_catalog.format('%I.%I', 'public', required.table_name),
      required.privilege
    )
  END
  ORDER BY required.table_name, required.privilege
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Privilege verification failed: public.%, %',
      missing_privilege.table_name, missing_privilege.privilege;
  END IF;
END
$verify$;

SELECT
  current_database() AS database_name,
  'ustara_test_owner' AS target_role,
  required.table_name,
  required.privilege,
  CASE
    WHEN required.table_name = 'barbers' AND required.privilege = 'UPDATE'
      THEN pg_catalog.has_any_column_privilege(
        'ustara_test_owner', pg_catalog.format('%I.%I', 'public', required.table_name), 'UPDATE'
      )
    ELSE pg_catalog.has_table_privilege(
      'ustara_test_owner',
      pg_catalog.format('%I.%I', 'public', required.table_name),
      required.privilege
    )
  END AS granted
FROM (VALUES
  ('users', 'SELECT'), ('users', 'INSERT'), ('users', 'DELETE'),
  ('customers', 'SELECT'), ('customers', 'INSERT'), ('customers', 'DELETE'),
  ('barbers', 'SELECT'), ('barbers', 'INSERT'), ('barbers', 'DELETE'), ('barbers', 'UPDATE'),
  ('services', 'SELECT'), ('services', 'INSERT'), ('services', 'UPDATE'), ('services', 'DELETE'),
  ('barber_working_hours', 'SELECT'), ('barber_working_hours', 'INSERT'), ('barber_working_hours', 'DELETE'),
  ('bookings', 'SELECT'), ('bookings', 'INSERT'), ('bookings', 'UPDATE'), ('bookings', 'DELETE'),
  ('admin_accounts', 'SELECT'), ('ustara_schema_migrations', 'SELECT'),
  ('registration_phone_limits', 'SELECT'), ('pending_registrations', 'SELECT'),
  ('registration_otp_history', 'SELECT'), ('registration_security_events', 'SELECT'),
  ('registration_admin_actions', 'SELECT'), ('login_attempt_limits', 'SELECT'),
  ('account_session_versions', 'SELECT'), ('account_session_versions', 'DELETE'),
  ('password_reset_limits', 'SELECT'), ('password_reset_requests', 'SELECT'),
  ('password_reset_events', 'SELECT'),
  ('barber_telegram_links', 'SELECT'), ('barber_telegram_links', 'INSERT'), ('barber_telegram_links', 'DELETE'),
  ('barber_telegram_link_tokens', 'SELECT'), ('telegram_bot_state', 'SELECT')
) AS required(table_name, privilege)
ORDER BY required.table_name, required.privilege;

COMMIT;
