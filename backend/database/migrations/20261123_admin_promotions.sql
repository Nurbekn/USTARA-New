-- Operator-controlled time-limited paid placements. Does not bill or authorize payment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS barber_promotions (
  barber_id INTEGER PRIMARY KEY REFERENCES barbers(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_date_order CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS barber_promotions_window_idx ON barber_promotions(expires_at,starts_at) WHERE is_active;
INSERT INTO ustara_schema_migrations(version) VALUES ('20261123_admin_promotions') ON CONFLICT(version) DO NOTHING;
COMMIT;
