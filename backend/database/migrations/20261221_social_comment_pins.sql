-- v167 / original decision #82: one pinned comment per post + comment spam read index.
-- Forward-only. Apply manually after a verified backup; this file is NOT executed by tests.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe social comment pin migration schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261220_barber_evidence_badges') THEN
  RAISE EXCEPTION 'Comment pin migration requires evidence badges';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261221_social_comment_pins')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('social_comments') AND a.attname='pinned' AND NOT a.attisdropped)
    OR pg_catalog.to_regclass('social_comments_one_pinned_v167_idx') IS NOT NULL
    OR pg_catalog.to_regclass('social_comments_author_recent_v167_idx') IS NOT NULL THEN
  RAISE EXCEPTION 'Comment pins migration already present or partially applied; inspect schema';
 END IF;
 ALTER TABLE social_comments ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;
 CREATE UNIQUE INDEX social_comments_one_pinned_v167_idx ON social_comments(post_id) WHERE pinned;
 CREATE INDEX social_comments_author_recent_v167_idx ON social_comments(user_id,created_at DESC);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261221_social_comment_pins');
END $$;
COMMIT;
