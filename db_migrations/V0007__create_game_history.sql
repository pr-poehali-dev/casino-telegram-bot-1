CREATE TABLE IF NOT EXISTS game_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    game VARCHAR(50) NOT NULL,
    bet DECIMAL(12,2) NOT NULL,
    result DECIMAL(12,2) NOT NULL,
    is_win BOOLEAN NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_history_user ON game_history(user_id, created_at DESC);