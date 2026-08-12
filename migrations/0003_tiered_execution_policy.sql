PRAGMA foreign_keys = ON;

ALTER TABLE execution_policies
ADD COLUMN exceptional_opportunity_score REAL NOT NULL DEFAULT 0.75;

UPDATE execution_policies
SET exceptional_opportunity_score = 0.75
WHERE id = 'paper-default-v0.1';
