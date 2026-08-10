PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paper_cycle_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  mode TEXT NOT NULL DEFAULT 'paper',
  pulse_hours INTEGER NOT NULL,
  requested_trend_limit INTEGER NOT NULL,
  requested_candidate_limit INTEGER NOT NULL,
  candidates_seen INTEGER NOT NULL DEFAULT 0,
  predictions_created INTEGER NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0,
  puts INTEGER NOT NULL DEFAULT 0,
  passes INTEGER NOT NULL DEFAULT 0,
  paper_fills INTEGER NOT NULL DEFAULT 0,
  escalations INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  summary_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_paper_cycle_runs_started
ON paper_cycle_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS paper_cycle_items (
  id TEXT PRIMARY KEY,
  cycle_run_id TEXT NOT NULL REFERENCES paper_cycle_runs(id),
  rank INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  smart_score REAL,
  prediction_id TEXT REFERENCES predictions(id),
  recommendation_type TEXT,
  estimated_ev_score REAL,
  paper_order_id TEXT,
  execution_status TEXT,
  execution_tier TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_run_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_paper_cycle_items_ticker
ON paper_cycle_items(ticker, created_at DESC);
