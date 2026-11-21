-- v161: private customer/barber conversation threads. Application deploy REQUIRES
-- this migration first. No data is backfilled, and no messages go to AI.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe chat migration schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261218_smart_booking_admin_rules')
    OR NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261118_social_portfolio_reviews') THEN
  RAISE EXCEPTION 'Chat requires preceding migration ledger entries';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261219_customer_barber_chat')
    OR pg_catalog.to_regclass('customer_barber_chat_threads') IS NOT NULL
    OR pg_catalog.to_regclass('customer_barber_chat_messages') IS NOT NULL THEN
  RAISE EXCEPTION 'Chat migration already applied or untracked';
 END IF;
 CREATE TABLE customer_barber_chat_threads (
   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   UNIQUE(customer_user_id,barber_id)
 );
 CREATE INDEX customer_barber_chat_customer_idx ON customer_barber_chat_threads(customer_user_id,updated_at DESC);
 CREATE INDEX customer_barber_chat_barber_idx ON customer_barber_chat_threads(barber_id,updated_at DESC);
 CREATE TABLE customer_barber_chat_messages (
   id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   thread_id BIGINT NOT NULL REFERENCES customer_barber_chat_threads(id) ON DELETE CASCADE,
   sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   body VARCHAR(1000) NOT NULL DEFAULT '',
   shared_post_id BIGINT REFERENCES social_posts(id) ON DELETE SET NULL,
   sender_kind VARCHAR(8) NOT NULL DEFAULT 'human' CHECK(sender_kind IN ('human','ai')),
   created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
   CONSTRAINT chat_message_has_content CHECK(length(btrim(body)) > 0 OR shared_post_id IS NOT NULL)
 );
 CREATE INDEX customer_barber_chat_messages_time_idx ON customer_barber_chat_messages(thread_id,id DESC);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261219_customer_barber_chat');
END $$;
COMMIT;
