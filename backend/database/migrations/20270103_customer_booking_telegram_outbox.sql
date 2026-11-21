-- v191: customer booking notices require explicit customer Telegram opt-in.
-- Durable outbox only. This migration NEVER calls Telegram and NEVER backfills bookings.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := pg_catalog.current_schema();
BEGIN
  IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN
    RAISE EXCEPTION 'Invalid schema for customer booking notification migration';
  END IF;
  PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),
    pg_catalog.hashtext('ustara-schema-ddl:'||schema_name));
  LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
  IF NOT EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20270102_customer_telegram_opt_in') THEN
    RAISE EXCEPTION 'Customer booking notifications require customer Telegram opt-in migration';
  END IF;
  IF EXISTS (SELECT 1 FROM ustara_schema_migrations WHERE version='20270103_customer_booking_telegram_outbox') THEN
    RAISE EXCEPTION 'Customer booking outbox migration already applied';
  END IF;
  IF pg_catalog.to_regclass(format('%I.customer_booking_telegram_outbox',schema_name)) IS NOT NULL THEN
    RAISE EXCEPTION 'Untracked customer booking outbox table exists';
  END IF;
  CREATE TABLE customer_booking_telegram_outbox (
    id BIGSERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_kind TEXT NOT NULL CHECK(event_kind IN ('pending','confirmed','cancelled','rejected','rescheduled')),
    expected_status TEXT NOT NULL CHECK(expected_status IN ('pending','confirmed','cancelled','rejected')),
    expected_booking_time TIMESTAMPTZ NOT NULL,
    expected_duration_minutes INTEGER NOT NULL CHECK(expected_duration_minutes>0),
    expected_service_id INTEGER NOT NULL,
    expected_barber_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','accepted','uncertain','cancelled')),
    claim_id UUID,
    claimed_at TIMESTAMPTZ,
    telegram_message_id BIGINT CHECK(telegram_message_id>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((status IN ('sending','accepted','uncertain') AND claim_id IS NOT NULL AND claimed_at IS NOT NULL)
      OR (status IN ('queued','cancelled') AND claim_id IS NULL AND claimed_at IS NULL)),
    CHECK (telegram_message_id IS NULL OR status='accepted')
  );
  CREATE INDEX customer_booking_telegram_outbox_queued_idx ON customer_booking_telegram_outbox(id)
    WHERE status='queued';
  CREATE INDEX customer_booking_telegram_outbox_user_idx ON customer_booking_telegram_outbox(user_id,id DESC);

  CREATE FUNCTION ustara_customer_booking_telegram_queue() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  DECLARE kind TEXT;
  BEGIN
    IF TG_OP='INSERT' THEN
      IF NEW.status IN ('pending','confirmed') THEN kind:=NEW.status; ELSE RETURN NEW; END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('pending','confirmed','cancelled','rejected') THEN kind:=NEW.status; END IF;
    ELSIF (NEW.booking_time IS DISTINCT FROM OLD.booking_time
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.service_id IS DISTINCT FROM OLD.service_id
       OR NEW.barber_id IS DISTINCT FROM OLD.barber_id)
       AND NEW.status IN ('pending','confirmed') THEN
      kind:='rescheduled';
    ELSE
      RETURN NEW;
    END IF;

    -- Old pending messages about this booking are now outdated.
    UPDATE customer_booking_telegram_outbox
      SET status='cancelled',updated_at=clock_timestamp()
      WHERE booking_id=NEW.id AND status='queued';
    IF kind IS NULL THEN RETURN NEW; END IF;
    INSERT INTO customer_booking_telegram_outbox(booking_id,user_id,event_kind,expected_status,expected_booking_time,expected_duration_minutes,expected_service_id,expected_barber_id)
      SELECT NEW.id,u.id,kind,NEW.status,NEW.booking_time,NEW.duration_minutes,NEW.service_id,NEW.barber_id
      FROM customers c JOIN users u ON u.id=c.user_id AND u.role='customer'
      JOIN customer_telegram_links l ON l.user_id=u.id AND l.notification_opt_in_at IS NOT NULL
      WHERE c.id=NEW.customer_id AND u.deactivated_at IS NULL AND u.admin_suspended_at IS NULL;
    RETURN NEW;
  END $fn$;
  CREATE TRIGGER ustara_customer_booking_telegram_queue_v191
    AFTER INSERT OR UPDATE OF status,booking_time,duration_minutes,service_id,barber_id ON bookings
    FOR EACH ROW EXECUTE FUNCTION ustara_customer_booking_telegram_queue();

  CREATE FUNCTION ustara_customer_telegram_revoke_pending() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $fn$
  BEGIN
    IF TG_OP='DELETE' THEN
      UPDATE customer_booking_telegram_outbox
        SET status='cancelled',updated_at=clock_timestamp()
        WHERE user_id=OLD.user_id AND status='queued';
      RETURN OLD;
    ELSIF NEW.notification_opt_in_at IS NULL THEN
      UPDATE customer_booking_telegram_outbox
        SET status='cancelled',updated_at=clock_timestamp()
        WHERE user_id=OLD.user_id AND status='queued';
    END IF;
    RETURN NEW;
  END $fn$;
  CREATE TRIGGER ustara_customer_telegram_revoke_pending_v191
    AFTER UPDATE OF notification_opt_in_at OR DELETE ON customer_telegram_links
    FOR EACH ROW EXECUTE FUNCTION ustara_customer_telegram_revoke_pending();
  INSERT INTO ustara_schema_migrations(version) VALUES('20270103_customer_booking_telegram_outbox');
END $$;
COMMIT;
