-- Forward-only. Eski bronlar va ularning saqlangan davomiyligi o‘zgarmaydi.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE schema_name TEXT := current_schema();
BEGIN
 IF schema_name IS NULL OR schema_name IN ('pg_catalog','information_schema') OR schema_name ~ '^pg_' THEN RAISE EXCEPTION 'Invalid schema'; END IF;
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',schema_name),true);
 PERFORM pg_advisory_xact_lock(hashtext(current_database()),hashtext('ustara-schema-ddl:'||schema_name));
 LOCK TABLE ustara_schema_migrations IN EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261115_slots_02_booking_no_overlap') THEN RAISE EXCEPTION 'Booking overlap migration required'; END IF;
 IF EXISTS(SELECT 1 FROM ustara_schema_migrations WHERE version='20261125_multi_service_bookings') THEN RAISE EXCEPTION 'Already applied; inspect schema'; END IF;
 ALTER TABLE services ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
 ALTER TABLE bookings ADD COLUMN total_price NUMERIC(12,2) CHECK(total_price>0);
 CREATE TABLE booking_services (
   booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
   position SMALLINT NOT NULL CHECK(position BETWEEN 0 AND 19),
   service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
   service_name TEXT NOT NULL CHECK(length(service_name)>0),
   price NUMERIC(10,2) NOT NULL CHECK(price>0),
   duration_minutes INTEGER NOT NULL CHECK(duration_minutes>0),
   PRIMARY KEY(booking_id,position), UNIQUE(booking_id,service_id)
 );
 CREATE INDEX booking_services_service_idx ON booking_services(service_id);
 INSERT INTO ustara_schema_migrations(version) VALUES('20261125_multi_service_bookings');
END $$;
COMMIT;
