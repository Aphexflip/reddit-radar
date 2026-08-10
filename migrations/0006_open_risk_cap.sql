PRAGMA foreign_keys = ON;

ALTER TABLE execution_policies
ADD COLUMN max_open_risk_usd REAL NOT NULL DEFAULT 200;

UPDATE execution_policies
SET max_open_risk_usd = 200
WHERE id = 'paper-default-v0.1';
