ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);