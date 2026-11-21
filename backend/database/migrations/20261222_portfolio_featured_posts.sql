-- #91: up to six featured portfolio works per barber (API serializes pins by barber row).
-- Forward-only; manually apply after backup. No migration is run by unit tests.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe portfolio featured migration schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261221_social_comment_pins') THEN
  RAISE EXCEPTION 'Featured portfolio migration requires comment pins';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261222_portfolio_featured_posts')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('social_posts') AND a.attname='featured_at' AND NOT a.attisdropped)
    OR pg_catalog.to_regclass('social_posts_featured_v168_idx') IS NOT NULL THEN
  RAISE EXCEPTION 'Featured portfolio migration already present or partially applied; inspect schema';
 END IF;
 ALTER TABLE social_posts ADD COLUMN featured_at TIMESTAMPTZ;
 CREATE INDEX social_posts_featured_v168_idx ON social_posts(barber_id,featured_at DESC,id DESC) WHERE featured_at IS NOT NULL;
 INSERT INTO ustara_schema_migrations(version) VALUES('20261222_portfolio_featured_posts');
END $$;
COMMIT;
