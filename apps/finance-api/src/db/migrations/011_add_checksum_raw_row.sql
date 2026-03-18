-- Migration 011: Add checksum and raw_row columns to transactions
--
-- These were previously stored only in Notion. Now that imports write
-- directly to SQLite, we need them locally for deduplication and audit.

ALTER TABLE transactions ADD COLUMN checksum TEXT;
ALTER TABLE transactions ADD COLUMN raw_row TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_checksum ON transactions(checksum);
