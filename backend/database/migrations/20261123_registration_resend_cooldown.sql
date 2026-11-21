-- Apply before deploying the OTP API. Never resets OTP delivery/attempt limits.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE
  schema_name TEXT := current_schema();
  version_name CONSTANT TEXT := '20261123_registration_resend_cooldown';
  history_ttl_name TEXT;
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Registration cooldown: invalid schema';
  END IF;
  PERFORM set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),true);
  PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:' || schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20261122_telegram_phone_requests') THEN
    RAISE EXCEPTION 'Registration cooldown: prerequisite migration missing';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version=version_name) THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=schema_name
      AND table_name='pending_registrations' AND column_name='resend_available_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES') THEN
      RAISE EXCEPTION 'Registration cooldown: applied marker/schema mismatch';
    END IF;
    RETURN;
  END IF;
  ALTER TABLE pending_registrations ADD COLUMN resend_available_at TIMESTAMPTZ;
  -- The original schema required exactly 3 minutes while the deployed service
  -- issues 1-minute codes. Retain historical rows without extending new OTPs.
  ALTER TABLE pending_registrations DROP CONSTRAINT pending_registrations_otp_ttl_check;
  ALTER TABLE pending_registrations ADD CONSTRAINT pending_registrations_otp_ttl_check
    CHECK (otp_expires_at IN (otp_sent_at + INTERVAL '1 minute', otp_sent_at + INTERVAL '3 minutes'));
  SELECT conname INTO STRICT history_ttl_name FROM pg_constraint
    WHERE conrelid='registration_otp_history'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%expires_at = (sent_at + %';
  EXECUTE format('ALTER TABLE registration_otp_history DROP CONSTRAINT %I',history_ttl_name);
  ALTER TABLE registration_otp_history ADD CONSTRAINT registration_otp_history_ttl_check
    CHECK (expires_at IN (sent_at + INTERVAL '1 minute', sent_at + INTERVAL '3 minutes'));
  -- Existing sessions use created_at + 60 seconds until their next accepted resend.
  INSERT INTO ustara_schema_migrations(version) VALUES(version_name);
END $$;
COMMIT;
