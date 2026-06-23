CREATE TABLE t_p11368176_casino_telegram_bot_.support_chats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE t_p11368176_casino_telegram_bot_.support_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES t_p11368176_casino_telegram_bot_.support_chats(id),
  sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'admin')),
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ON t_p11368176_casino_telegram_bot_.support_messages (chat_id, created_at);
CREATE INDEX ON t_p11368176_casino_telegram_bot_.support_chats (user_id);
