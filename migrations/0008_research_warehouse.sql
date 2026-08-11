PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS research_datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  data_class TEXT NOT NULL,
  quality_class TEXT NOT NULL,
  earliest_available_time TEXT,
  latest_available_time TEXT,
  license_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS research_backfill_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES research_datasets(id),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  requested_start_time TEXT,
  requested_end_time TEXT,
  requested_symbols_json TEXT,
  partitions_attempted INTEGER NOT NULL DEFAULT 0,
  partitions_completed INTEGER NOT NULL DEFAULT 0,
  partitions_failed INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  last_error TEXT,
  code_version TEXT,
  config_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_backfill_dataset_time
ON research_backfill_runs(dataset_id, started_at DESC);

CREATE TABLE IF NOT EXISTS research_partitions (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES research_datasets(id),
  symbol TEXT,
  partition_date TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  object_key TEXT,
  payload_hash TEXT,
  row_count INTEGER,
  min_event_time TEXT,
  max_event_time TEXT,
  quality_class TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dataset_id, partition_key)
);

CREATE INDEX IF NOT EXISTS idx_research_partitions_coverage
ON research_partitions(dataset_id, symbol, partition_date, status);

CREATE TABLE IF NOT EXISTS research_feature_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  feature_schema_json TEXT NOT NULL,
  code_version TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS research_setup_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  as_of_time TEXT NOT NULL,
  feature_set_id TEXT NOT NULL REFERENCES research_feature_sets(id),
  features_json TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  source_lineage_json TEXT NOT NULL,
  missingness_json TEXT,
  data_quality REAL,
  regime_label TEXT,
  catalyst_class TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_id, as_of_time, feature_set_id)
);

CREATE INDEX IF NOT EXISTS idx_research_setup_entity_time
ON research_setup_snapshots(entity_id, as_of_time);

CREATE TABLE IF NOT EXISTS research_outcome_labels (
  id TEXT PRIMARY KEY,
  setup_snapshot_id TEXT NOT NULL REFERENCES research_setup_snapshots(id),
  label_name TEXT NOT NULL,
  target_time TEXT NOT NULL,
  observed_at TEXT,
  numeric_value REAL,
  boolean_value INTEGER CHECK(boolean_value IN (0,1) OR boolean_value IS NULL),
  quality_class TEXT NOT NULL,
  provider TEXT,
  object_key TEXT,
  payload_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(setup_snapshot_id, label_name)
);

CREATE INDEX IF NOT EXISTS idx_research_labels_name
ON research_outcome_labels(label_name, target_time);

CREATE TABLE IF NOT EXISTS research_backtests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  feature_set_id TEXT NOT NULL REFERENCES research_feature_sets(id),
  dataset_cutoff_time TEXT NOT NULL,
  train_window_json TEXT NOT NULL,
  validation_window_json TEXT,
  holdout_window_json TEXT NOT NULL,
  friction_model_json TEXT NOT NULL,
  controls_json TEXT NOT NULL,
  leakage_audit_status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  sample_count INTEGER NOT NULL DEFAULT 0,
  result_metrics_json TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  code_version TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_backtests_started
ON research_backtests(started_at DESC);

CREATE TABLE IF NOT EXISTS research_calibration_bins (
  id TEXT PRIMARY KEY,
  backtest_id TEXT NOT NULL REFERENCES research_backtests(id),
  metric_name TEXT NOT NULL,
  bin_label TEXT NOT NULL,
  predicted_low REAL,
  predicted_high REAL,
  sample_count INTEGER NOT NULL,
  observed_rate REAL,
  observed_mean REAL,
  ci_low REAL,
  ci_high REAL,
  metadata_json TEXT,
  UNIQUE(backtest_id, metric_name, bin_label)
);

INSERT OR IGNORE INTO research_datasets(
  id, name, source_type, provider, data_class, quality_class, status, metadata_json
) VALUES
  ('dataset:alpaca-stock-history', 'Alpaca stock history', 'market', 'alpaca', 'underlying_history', 'research', 'planned', '{"priority":1}'),
  ('dataset:alpaca-option-history', 'Alpaca option history', 'options', 'alpaca', 'option_history', 'research', 'planned', '{"priority":2}'),
  ('dataset:sec-edgar-history', 'SEC EDGAR historical events', 'regulatory', 'sec.gov', 'event_history', 'authoritative', 'planned', '{"priority":3}'),
  ('dataset:reddit-pulse-history', 'Reddit Pulse historical features', 'reddit', 'redditpulse-db', 'alternative_history', 'research', 'planned', '{"priority":4}');

INSERT OR IGNORE INTO research_feature_sets(
  id, name, version, feature_schema_json, active
) VALUES(
  'feature-set:setup-v0.1',
  'historical-setup-fingerprint',
  '0.1',
  '{"families":["reddit","market","regime","catalyst","options","relationship","quality"]}',
  1
);
