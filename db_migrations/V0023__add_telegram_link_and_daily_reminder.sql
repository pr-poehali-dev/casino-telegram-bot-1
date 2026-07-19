ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(16);
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_reminder_sent_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_link_code ON users(telegram_link_code) WHERE telegram_link_code IS NOT NULL;