PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS outcome_targets (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL REFERENCES predictions(id),
  horizon_label TEXT NOT NULL,
  target_time TEXT NOT NULL,
  not_before_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  measured_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prediction_id, horizon_label)
);

CREATE INDEX IF NOT EXISTS idx_outcome_targets_due
ON outcome_targets(status, not_before_time);

ALTER TABLE paper_orders ADD COLUMN exit_target_time TEXT;
ALTER TABLE paper_orders ADD COLUMN closed_at TEXT;
ALTER TABLE paper_orders ADD COLUMN exit_price REAL;
ALTER TABLE paper_orders ADD COLUMN realized_pnl_usd REAL;
ALTER TABLE paper_orders ADD COLUMN exit_method TEXT;
