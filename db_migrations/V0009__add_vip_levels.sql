ALTER TABLE t_p11368176_casino_telegram_bot_.users
  ADD COLUMN vip_level VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN total_deposited NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN cashback_available NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN cashback_claimed_at TIMESTAMP NULL;

-- Таблица начислений кешбэка
CREATE TABLE t_p11368176_casino_telegram_bot_.cashback_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.users(id),
  amount NUMERIC(12,2) NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  losses NUMERIC(12,2) NOT NULL,
  vip_level VARCHAR(20) NOT NULL,
  pct NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Пересчитываем total_deposited из orders для существующих пользователей
UPDATE t_p11368176_casino_telegram_bot_.users u
SET total_deposited = COALESCE((
  SELECT SUM(o.amount) FROM t_p11368176_casino_telegram_bot_.orders o
  WHERE o.user_id = u.id AND o.status = 'paid'
), 0);

-- Выставляем vip_level исходя из total_deposited
UPDATE t_p11368176_casino_telegram_bot_.users SET vip_level =
  CASE
    WHEN total_deposited >= 500000 THEN 'platinum'
    WHEN total_deposited >= 100000 THEN 'gold'
    WHEN total_deposited >= 25000  THEN 'silver'
    WHEN total_deposited >= 5000   THEN 'bronze'
    ELSE 'none'
  END;
