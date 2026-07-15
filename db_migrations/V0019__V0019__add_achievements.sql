CREATE TABLE IF NOT EXISTS user_achievements (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  achievement_id VARCHAR(50) NOT NULL,
  unlocked_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_achievements_unique ON user_achievements(user_id, achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);