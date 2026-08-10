PRAGMA foreign_keys = ON;

-- If the predicted horizon equals a fixed checkpoint (for example the default 24h),
-- keep the predicted-horizon row because it is the canonical trade-exit measurement.
DELETE FROM outcome_targets
WHERE horizon_label <> 'predicted_elapsed'
  AND EXISTS (
    SELECT 1
    FROM outcome_targets predicted
    WHERE predicted.prediction_id = outcome_targets.prediction_id
      AND predicted.horizon_label = 'predicted_elapsed'
      AND predicted.target_time = outcome_targets.target_time
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_outcome_targets_unique_time
ON outcome_targets(prediction_id, target_time);

CREATE TRIGGER IF NOT EXISTS trg_outcome_targets_prefer_predicted_horizon
BEFORE INSERT ON outcome_targets
WHEN NEW.horizon_label = 'predicted_elapsed'
BEGIN
  DELETE FROM outcome_targets
  WHERE prediction_id = NEW.prediction_id
    AND target_time = NEW.target_time
    AND horizon_label <> 'predicted_elapsed';
END;
