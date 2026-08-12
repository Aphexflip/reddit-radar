PRAGMA foreign_keys = ON;

-- End the temporary $1k paper-validation profile now that the full mechanical
-- and strategy paper lifecycle has been exercised. Existing filled positions
-- remain open and continue to be tracked; this only governs NEW paper entries.
UPDATE execution_policies
SET active = 0
WHERE active = 1;

INSERT OR IGNORE INTO execution_policies(
  id, name, active, daily_target_usd, daily_hard_cap_usd, max_single_trade_usd,
  daily_loss_stop_usd, min_opportunity_score, max_bid_ask_spread_pct,
  min_open_interest, min_volume, min_days_to_expiration, allow_0dte, live_enabled,
  exceptional_opportunity_score, max_open_risk_usd
) VALUES (
  'paper-default-v0.1', 'Paper standard v0.1', 0,
  50, 100, 100,
  40, 0.60, 0.25,
  25, 5, 7, 0, 0,
  0.75, 200
);

UPDATE execution_policies
SET
  name = 'Paper standard v0.1',
  active = 1,
  daily_target_usd = 50,
  daily_hard_cap_usd = 100,
  max_single_trade_usd = 100,
  daily_loss_stop_usd = 40,
  min_opportunity_score = 0.60,
  max_bid_ask_spread_pct = 0.25,
  min_open_interest = 25,
  min_volume = 5,
  min_days_to_expiration = 7,
  allow_0dte = 0,
  live_enabled = 0,
  exceptional_opportunity_score = 0.75,
  max_open_risk_usd = 200
WHERE id = 'paper-default-v0.1';
