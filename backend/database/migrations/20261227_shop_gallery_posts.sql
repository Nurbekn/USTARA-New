-- v173 #124: shop gallery references owner-authored portfolio posts (max 8 slots).
-- Never run without explicit approval and backup; no existing booking is modified.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE target_schema TEXT := pg_catalog.current_schema();
BEGIN
 IF target_schema IS NULL OR target_schema IN ('pg_catalog','information_schema') OR target_schema ~ '^pg_' THEN
  RAISE EXCEPTION 'Unsafe shop gallery schema';
 END IF;
 PERFORM pg_catalog.set_config('search_path',format('%I,pg_catalog,pg_temp',target_schema),true);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(pg_catalog.current_database()),pg_catalog.hashtext('ustara-schema-ddl:' || target_schema));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261226_single_address_barber_shops') THEN
  RAISE EXCEPTION 'Shop gallery requires v172 shop migration';
 END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261227_shop_gallery_posts')
  OR pg_catalog.to_regclass('shop_gallery_posts') IS NOT NULL THEN
  RAISE EXCEPTION 'Shop gallery already recorded or partially applied';
 END IF;
 CREATE TABLE shop_gallery_posts (
  shop_id INTEGER NOT NULL REFERENCES barber_owned_shops(id) ON DELETE CASCADE,
  post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK(position BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(shop_id,post_id),
  UNIQUE(shop_id,position)
 );
 INSERT INTO ustara_schema_migrations(version) VALUES('20261227_shop_gallery_posts');
END $$;
COMMIT;
