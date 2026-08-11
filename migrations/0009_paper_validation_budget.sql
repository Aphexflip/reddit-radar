PRAGMA foreign_keys = ON;

-- Temporary paper-validation profile: widen simulated buying power so the
-- end-to-end CALL/PUT -> contract -> risk gate -> paper fill -> outcome path
-- can be exercised during live testing without lowering evidence or option
-- quality thresholds. Live trading remains disabled.
UPDATE execution_policies
SET active = 0
WHERE active = 1;

INSERT INTO execution_policies(
  id, name, active, daily_target_usd, daily_hard_cap_usd, max_single_trade_usd,
  daily_loss_stop_usd, min_opportunity_score, max_bid_ask_spread_pct,
  min_open_interest, min_volume, min_days_to_expiration, allow_0dte, live_enabled,
  exceptional_opportunity_score, max_open_risk_usd
) VALUES (
  'paper-validation-1k-v0.1', 'Paper validation $1k v0.1', 1,
  50, 1000, 1000,
  40, 0.60, 0.25,
  25, 5, 7, 0, 0,
  0.75, 1000
);
