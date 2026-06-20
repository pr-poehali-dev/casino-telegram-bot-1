-- Реферальный код для каждого пользователя
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id);

-- Генерируем коды существующим пользователям
UPDATE users SET referral_code = UPPER(SUBSTRING(MD5(id::text || email), 1, 8)) WHERE referral_code IS NULL;

-- Таблица реферальных начислений
CREATE TABLE IF NOT EXISTS referral_bonuses (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id),
    referee_id INTEGER NOT NULL REFERENCES users(id),
    amount DECIMAL(12,2) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'signup' | 'deposit'
    source_amount DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referral_bonuses_referrer ON referral_bonuses(referrer_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);