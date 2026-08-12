PRAGMA foreign_keys = ON;

ALTER TABLE paper_orders ADD COLUMN broker_mode TEXT NOT NULL DEFAULT 'local_sim';
ALTER TABLE paper_orders ADD COLUMN broker_order_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_client_order_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_status TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_request_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_last_synced_at TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_error_code TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_error_message TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_position_qty REAL;
ALTER TABLE paper_orders ADD COLUMN broker_buying_power REAL;
ALTER TABLE paper_orders ADD COLUMN broker_options_buying_power REAL;
ALTER TABLE paper_orders ADD COLUMN broker_close_order_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_close_client_order_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_close_status TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_close_request_id TEXT;
ALTER TABLE paper_orders ADD COLUMN broker_close_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_paper_orders_broker_state
ON paper_orders(broker_mode, status, broker_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_orders_broker_client_order
ON paper_orders(broker_client_order_id)
WHERE broker_client_order_id IS NOT NULL;

-- Research outcome collection intentionally keeps measuring historical references,
-- but broker-backed positions must never be closed by the old historical-bar
-- simulator. Only an Alpaca PAPER broker fill may close an alpaca_paper position.
CREATE TRIGGER IF NOT EXISTS prevent_historical_close_for_alpaca_paper
BEFORE UPDATE OF status ON paper_orders
WHEN OLD.broker_mode = 'alpaca_paper'
  AND NEW.status = 'closed'
  AND NEW.exit_method = 'historical_trade_bar_close'
BEGIN
  SELECT RAISE(IGNORE);
END;
