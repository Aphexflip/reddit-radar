PRAGMA foreign_keys = ON;

-- Reddit Radar / Options Intelligence v0.1
-- SQLite / Cloudflare D1-compatible control-plane schema.
-- Large raw payloads and time-series belong in object storage; this schema stores manifests,
-- relationships, decision state, immutable prediction metadata, and measured outcomes.

CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

INSERT OR IGNORE INTO schema_versions(version, notes)
VALUES ('0.1.0', 'Initial options intelligence and immutable prediction ledger schema');

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,
  canonical_url TEXT,
  license_class TEXT,
  reliability_prior REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  ticker TEXT,
  cik TEXT,
  exchange TEXT,
  country_code TEXT,
  active_from TEXT,
  active_to TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_ticker_exchange
ON entities(ticker, exchange)
WHERE ticker IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entities_cik ON entities(cik);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  alias TEXT NOT NULL,
  alias_type TEXT,
  valid_from TEXT,
  valid_to TEXT,
  source_id TEXT REFERENCES sources(id),
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entity_alias_lookup ON entity_aliases(alias);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  subject_entity_id TEXT NOT NULL REFERENCES entities(id),
  predicate TEXT NOT NULL,
  object_entity_id TEXT NOT NULL REFERENCES entities(id),
  confidence REAL NOT NULL DEFAULT 0.5,
  is_inferred INTEGER NOT NULL DEFAULT 0 CHECK(is_inferred IN (0,1)),
  inference_method TEXT,
  source_id TEXT REFERENCES sources(id),
  valid_from TEXT,
  valid_to TEXT,
  evidence_object_key TEXT,
  evidence_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_relationship_subject ON relationships(subject_entity_id, predicate);
CREATE INDEX IF NOT EXISTS idx_relationship_object ON relationships(object_entity_id, predicate);

CREATE TABLE IF NOT EXISTS raw_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_event_id TEXT,
  event_type TEXT NOT NULL,
  event_time TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  object_key TEXT,
  payload_hash TEXT NOT NULL,
  canonical_url TEXT,
  author_or_actor TEXT,
  language TEXT,
  title TEXT,
  summary TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  metadata_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_event_source_event
ON raw_events(source_id, source_event_id)
WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_event_time ON raw_events(event_time);
CREATE INDEX IF NOT EXISTS idx_raw_event_type ON raw_events(event_type, event_time);

CREATE TABLE IF NOT EXISTS event_entity_links (
  event_id TEXT NOT NULL REFERENCES raw_events(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  link_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  resolver_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id, entity_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_event_entity_entity ON event_entity_links(entity_id, event_id);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  signal_type TEXT NOT NULL,
  entity_id TEXT REFERENCES entities(id),
  event_id TEXT REFERENCES raw_events(id),
  observed_at TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  numeric_value REAL,
  text_value TEXT,
  unit TEXT,
  baseline_value REAL,
  normalized_value REAL,
  direction_hint TEXT CHECK(direction_hint IN ('bullish','bearish','neutral','mixed') OR direction_hint IS NULL),
  confidence REAL,
  feature_version TEXT,
  provenance_json TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_entity_time ON signals(entity_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_signals_type_time ON signals(signal_type, observed_at);

CREATE TABLE IF NOT EXISTS catalysts (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  catalyst_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  earliest_event_time TEXT,
  latest_evidence_time TEXT,
  headline TEXT NOT NULL,
  structured_summary_json TEXT,
  novelty_score REAL,
  surprise_score REAL,
  source_reliability_score REAL,
  pricing_in_score REAL,
  relationship_support_score REAL,
  bullish_probability REAL,
  bearish_probability REAL,
  neutral_probability REAL,
  expected_move_low_pct REAL,
  expected_move_high_pct REAL,
  expected_horizon_minutes INTEGER,
  confidence REAL,
  model_version TEXT,
  status TEXT NOT NULL DEFAULT 'developing'
);

CREATE INDEX IF NOT EXISTS idx_catalysts_entity_created ON catalysts(entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_catalysts_status ON catalysts(status, created_at);

CREATE TABLE IF NOT EXISTS catalyst_signals (
  catalyst_id TEXT NOT NULL REFERENCES catalysts(id),
  signal_id TEXT NOT NULL REFERENCES signals(id),
  role TEXT NOT NULL DEFAULT 'supporting',
  weight REAL,
  PRIMARY KEY(catalyst_id, signal_id)
);

CREATE TABLE IF NOT EXISTS evidence_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  catalyst_id TEXT REFERENCES catalysts(id),
  cutoff_time TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  manifest_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  system_version TEXT NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_evidence_entity_cutoff ON evidence_snapshots(entity_id, cutoff_time);

CREATE TABLE IF NOT EXISTS evidence_items (
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  item_type TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_hash TEXT,
  event_time TEXT,
  role TEXT,
  PRIMARY KEY(evidence_snapshot_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  thesis_side TEXT NOT NULL CHECK(thesis_side IN ('bull','bear','skeptic','judge')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claims_json TEXT NOT NULL,
  assumptions_json TEXT,
  supporting_evidence_json TEXT,
  contradicting_evidence_json TEXT,
  failure_modes_json TEXT,
  conclusion_json TEXT,
  model_name TEXT,
  model_version TEXT,
  prompt_version TEXT,
  content_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_theses_snapshot ON theses(evidence_snapshot_id, thesis_side);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  observed_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  underlying_price REAL,
  bid REAL,
  ask REAL,
  last REAL,
  volume REAL,
  relative_volume REAL,
  market_cap REAL,
  day_change_pct REAL,
  object_key TEXT,
  payload_hash TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_market_snapshot_entity_time ON market_snapshots(entity_id, observed_at);

CREATE TABLE IF NOT EXISTS option_contract_snapshots (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  contract_symbol TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK(option_type IN ('call','put')),
  strike REAL NOT NULL,
  expiration_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  underlying_price REAL,
  bid REAL,
  ask REAL,
  mark REAL,
  last REAL,
  volume REAL,
  open_interest REAL,
  implied_volatility REAL,
  delta REAL,
  gamma REAL,
  theta REAL,
  vega REAL,
  rho REAL,
  object_key TEXT,
  payload_hash TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_option_chain_lookup
ON option_contract_snapshots(entity_id, expiration_date, option_type, strike, observed_at);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities(id),
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  market_snapshot_id TEXT REFERENCES market_snapshots(id),
  recommendation_type TEXT NOT NULL CHECK(recommendation_type IN ('CALL','PUT','CALL_SPREAD','PUT_SPREAD','PASS')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  underlying_opportunity_score REAL,
  option_expression_score REAL,
  estimated_ev_score REAL,
  moonshot_score REAL,
  direction_confidence REAL,
  magnitude_score REAL,
  timing_confidence REAL,
  catalyst_strength REAL,
  information_novelty REAL,
  source_reliability REAL,
  relationship_graph_support REAL,
  market_confirmation REAL,
  options_liquidity REAL,
  volatility_value REAL,
  adversarial_survival REAL,
  data_quality REAL,
  rationale_json TEXT NOT NULL,
  strategy_json TEXT,
  model_version TEXT NOT NULL,
  content_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendations_ev ON recommendations(estimated_ev_score, created_at);

CREATE TABLE IF NOT EXISTS recommendation_contracts (
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  option_snapshot_id TEXT NOT NULL REFERENCES option_contract_snapshots(id),
  leg_role TEXT NOT NULL,
  quantity_ratio REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(recommendation_id, option_snapshot_id, leg_role)
);

-- Immutable published ledger. Application code must never UPDATE or DELETE these rows.
-- Corrections/new views create a new prediction referencing supersedes_prediction_id.
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id),
  entity_id TEXT NOT NULL REFERENCES entities(id),
  evidence_snapshot_id TEXT NOT NULL REFERENCES evidence_snapshots(id),
  published_at TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
  confidence REAL NOT NULL,
  probability_profitable REAL,
  expected_move_low_pct REAL,
  expected_move_high_pct REAL,
  horizon_minutes INTEGER NOT NULL,
  invalidation_json TEXT,
  entry_assumptions_json TEXT,
  system_version TEXT NOT NULL,
  model_bundle_version TEXT NOT NULL,
  ledger_payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  previous_prediction_hash TEXT,
  supersedes_prediction_id TEXT REFERENCES predictions(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_hash ON predictions(content_hash);
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
  time_to_peak_minutes INTEGER,
  invalidation_triggered INTEGER CHECK(invalidation_triggered IN (0,1) OR invalidation_triggered IS NULL),
  fill_assumption_json TEXT,
  provider TEXT,
  evidence_object_key TEXT,
  payload_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(prediction_id, horizon_label)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_prediction ON outcomes(prediction_id, target_time);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  evaluation_type TEXT NOT NULL,
  dataset_cutoff_time TEXT NOT NULL,
  training_window_json TEXT,
  validation_window_json TEXT,
  holdout_window_json TEXT,
  model_bundle_version TEXT,
  strategy_version TEXT,
  friction_model_version TEXT,
  baseline_config_json TEXT,
  result_metrics_json TEXT,
  sample_count INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS evaluation_prediction_membership (
  evaluation_run_id TEXT NOT NULL REFERENCES evaluation_runs(id),
  prediction_id TEXT NOT NULL REFERENCES predictions(id),
  split TEXT NOT NULL CHECK(split IN ('train','validation','holdout','live','control')),
  PRIMARY KEY(evaluation_run_id, prediction_id)
);

-- Audit table for operational mutations to non-ledger tables.
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_log(object_type, object_id, occurred_at);
