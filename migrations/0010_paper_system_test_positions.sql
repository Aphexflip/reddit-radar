PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS paper_system_test_positions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  contract_symbol TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK(option_type IN ('call','put')),
  strike REAL NOT NULL,
  expiration_date TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  entry_bid REAL,
  entry_ask REAL NOT NULL,
  entry_fill_price REAL NOT NULL,
  notional_usd REAL NOT NULL,
  opened_at TEXT NOT NULL,
  close_after_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  last_bid REAL,
  last_ask REAL,
  last_mark REAL,
  last_marked_at TEXT,
  unrealized_pnl_usd REAL,
  closed_at TEXT,
  exit_price REAL,
  realized_pnl_usd REAL,
  close_method TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_paper_system_test_status
ON paper_system_test_positions(status, close_after_at);
