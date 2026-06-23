ALTER TABLE t_p11368176_casino_telegram_bot_.users
  ADD COLUMN avatar_url TEXT NULL,
  ADD COLUMN last_spin_at DATE NULL;

CREATE TABLE t_p11368176_casino_telegram_bot_.spin_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.users(id),
  prize_type VARCHAR(20) NOT NULL,
  prize_value NUMERIC(12,2) NULL,
  prize_code VARCHAR(50) NULL,
  spun_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
