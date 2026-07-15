CREATE TABLE IF NOT EXISTS ab_tests (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  test_type     VARCHAR(30) NOT NULL DEFAULT 'first_deposit_bonus',
  status        VARCHAR(20) NOT NULL DEFAULT 'draft',
  variant_a_label   VARCHAR(50) NOT NULL DEFAULT 'A',
  variant_a_value   NUMERIC(6,2) NOT NULL DEFAULT 100,
  variant_b_label   VARCHAR(50) NOT NULL DEFAULT 'B',
  variant_b_value   NUMERIC(6,2) NOT NULL DEFAULT 150,
  traffic_split     INTEGER NOT NULL DEFAULT 50,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMP,
  stopped_at    TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id            SERIAL PRIMARY KEY,
  test_id       INTEGER NOT NULL REFERENCES ab_tests(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  variant       VARCHAR(1) NOT NULL,
  assigned_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  converted     BOOLEAN NOT NULL DEFAULT FALSE,
  converted_at  TIMESTAMP,
  conversion_value NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_assignment_unique ON ab_test_assignments(test_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignment_test ON ab_test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignment_user ON ab_test_assignments(user_id);