CREATE TABLE IF NOT EXISTS user_daily_quests (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  quest_id       VARCHAR(50) NOT NULL,
  quest_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_daily_quests_unique ON user_daily_quests(user_id, quest_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_user_daily_quests_user ON user_daily_quests(user_id, quest_date);