CREATE TABLE t_p11368176_casino_telegram_bot_.promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  bonus_amount NUMERIC(12,2) NOT NULL,
  max_uses INTEGER NULL,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL
);

CREATE TABLE t_p11368176_casino_telegram_bot_.promo_activations (
  id SERIAL PRIMARY KEY,
  promo_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.promo_codes(id),
  user_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.users(id),
  activated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(promo_id, user_id)
);

INSERT INTO t_p11368176_casino_telegram_bot_.promo_codes (code, bonus_amount, max_uses) VALUES
  ('WELCOME100', 100.00, NULL),
  ('BONUS500', 500.00, 50);
