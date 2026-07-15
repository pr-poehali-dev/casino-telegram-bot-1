ALTER TABLE users
  ADD COLUMN IF NOT EXISTS loyalty_points          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_lifetime  INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loyalty_redemptions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  points      INTEGER NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_redemptions_user ON loyalty_redemptions(user_id);