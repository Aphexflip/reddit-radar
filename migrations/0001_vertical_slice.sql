PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,
  reliability_prior REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  ticker TEXT,
  exchange TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_ticker ON entities(ticker) WHERE ticker IS NOT NULL;

CREATE TABLE IF NOT EXISTS raw_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_event_id TEXT,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  object_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  summary TEXT,
  metadata_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_events_source_event
ON raw_events(source_id, source_event_id)
WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_entity_links (
  event_id TEXT NOT NULL REFERENCES raw_events(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  link_type TEXT NOT NULL DEFAULT 'mentioned',
  confidence REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id, entity_id, link_type)
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  event_id TEXT REFERENCES raw_events(id),
  observed_at TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  numeric_value REAL,
  normalized_value REAL,
  baseline_value REAL,
  unit TEXT,
  direction_hint TEXT CHECK(direction_hint IN ('bullish','bearish','neutral','mixed')),
  confidence REAL NOT NULL DEFAULT 0.5,
  feature_version TEXT NOT NULL DEFAULT 'v0.1',
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_entity_time ON signals(entity_id, observed_at);

CREATE TABLE IF NOT EXISTS catalysts (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  catalyst_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  latest_evidence_time TEXT NOT NULL,
  headline TEXT NOT NULL,
  structured_summary_json TEXT NOT NULL,
  bullish_probability REAL,
  bearish_probability REAL,
  neutral_probability REAL,
  confidence REAL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'developing'
);

CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  catalyst_id TEXT REFERENCES catalysts(id),
  cutoff_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  manifest_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  system_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  thesis_side TEXT NOT NULL CHECK(thesis_side IN ('bull','bear','skeptic','judge')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claims_json TEXT NOT NULL,
  failure_modes_json TEXT,
  conclusion_json TEXT NOT NULL,
  model_version TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  observed_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  underlying_price REAL NOT NULL,
  bid REAL,
  ask REAL,
  last REAL,
  volume REAL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS option_contract_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  contract_symbol TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK(option_type IN ('call','put')),
  strike REAL NOT NULL,
  expiration_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  underlying_price REAL NOT NULL,
  bid REAL NOT NULL,
  ask REAL NOT NULL,
  mark REAL,
  volume REAL,
  open_interest REAL,
  implied_volatility REAL,
  delta REAL,
  gamma REAL,
  theta REAL,
  vega REAL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_option_contract_lookup
ON option_contract_snapshots(entity_id, expiration_date, option_type, strike, observed_at);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  market_snapshot_id TEXT REFERENCES market_snapshots(id),
  recommendation_type TEXT NOT NULL CHECK(recommendation_type IN ('CALL','PUT','PASS')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  underlying_opportunity_score REAL NOT NULL,
  option_expression_score REAL NOT NULL,
  estimated_ev_score REAL NOT NULL,
  moonshot_score REAL NOT NULL,
  data_quality REAL NOT NULL,
  rationale_json TEXT NOT NULL,
  strategy_json TEXT,
  model_version TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendation_contracts (
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  option_snapshot_id TEXT NOT NULL REFERENCES option_contract_snapshots(id),
  leg_role TEXT NOT NULL DEFAULT 'long',
  quantity_ratio REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(recommendation_id, option_snapshot_id, leg_role)
);

CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  published_at TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
  confidence REAL NOT NULL,
  probability_profitable REAL,
  horizon_minutes INTEGER NOT NULL,
  invalidation_json TEXT,
  entry_assumptions_json TEXT,
  system_version TEXT NOT NULL,
  model_bundle_version TEXT NOT NULL,
  ledger_payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  previous_prediction_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictions_entity_time ON predictions(entity_id, published_at);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL REFERENCES predictions(id),
  horizon_label TEXT NOT NULL,
  target_time TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  underlying_entry_price REAL,
  underlying_exit_price REAL,
  underlying_return_pct REAL,
  option_entry_mid REAL,
  option_exit_mid REAL,
  option_mid_return_pct REAL,
  executable_entry_price REAL,
  executable_exit_price REAL,
  executable_return_pct REAL,
  max_favorable_excursion_pct REAL,
  max_adverse_excursion_pct REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prediction_id, horizon_label)
);

CREATE TABLE IF NOT EXISTS execution_policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  daily_target_usd REAL NOT NULL,
  daily_hard_cap_usd REAL NOT NULL,
  max_single_trade_usd REAL NOT NULL,
  daily_loss_stop_usd REAL NOT NULL,
  min_opportunity_score REAL NOT NULL,
  max_bid_ask_spread_pct REAL NOT NULL,
  min_open_interest REAL NOT NULL,
  min_volume REAL NOT NULL,
  min_days_to_expiration INTEGER NOT NULL,
  allow_0dte INTEGER NOT NULL DEFAULT 0 CHECK(allow_0dte IN (0,1)),
  live_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_risk_state (
  trading_date TEXT PRIMARY KEY,
  deployed_usd REAL NOT NULL DEFAULT 0,
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  open_risk_usd REAL NOT NULL DEFAULT 0,
  new_positions_blocked INTEGER NOT NULL DEFAULT 0 CHECK(new_positions_blocked IN (0,1)),
  block_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paper_orders (
  id TEXT PRIMARY KEY,
  prediction_id TEXT NOT NULL REFERENCES predictions(id),
  option_snapshot_id TEXT NOT NULL REFERENCES option_contract_snapshots(id),
  contract_symbol TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  limit_price REAL NOT NULL,
  notional_usd REAL NOT NULL,
  status TEXT NOT NULL,
  block_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filled_at TEXT,
  fill_price REAL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_order_prediction ON paper_orders(prediction_id);

INSERT OR IGNORE INTO execution_policies(
  id, name, active, daily_target_usd, daily_hard_cap_usd, max_single_trade_usd,
  daily_loss_stop_usd, min_opportunity_score, max_bid_ask_spread_pct,
  min_open_interest, min_volume, min_days_to_expiration, allow_0dte, live_enabled
) VALUES (
  'paper-default-v0.1', 'Paper default v0.1', 1, 50, 100, 100,
  40, 0.60, 0.25, 25, 5, 7, 0, 0
);
