ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until     TIMESTAMP DEFAULT NULL;

CREATE TABLE IF NOT EXISTS login_rate_limits (
  id            SERIAL PRIMARY KEY,
  ip_address    VARCHAR(64) NOT NULL,
  window_start  TIMESTAMP NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  locked_until  TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_login_rate_limits_ip ON login_rate_limits(ip_address);