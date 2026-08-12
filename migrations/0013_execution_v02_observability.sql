PRAGMA foreign_keys = ON;

ALTER TABLE paper_cycle_items ADD COLUMN execution_contract_symbol TEXT;
ALTER TABLE paper_cycle_items ADD COLUMN execution_debit_usd REAL;
ALTER TABLE paper_cycle_items ADD COLUMN execution_reason TEXT;
