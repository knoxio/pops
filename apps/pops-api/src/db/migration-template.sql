-- Migration: YYYYMMDDHHMMSS_domain_description.sql
-- Domain:    <core | finance | inventory | media | fitness | travel | ...>
-- Description: <What this migration does>
-- Changes:   <Tables/columns affected>
--
-- To use: copy this file into src/db/migrations/ with a timestamped name.
-- Example: 20260320140000_finance_add_recurring_flag.sql

-- ============================================================
-- Forward migration
-- ============================================================

-- Your SQL here. Use IF NOT EXISTS / IF NOT NULL for idempotency.
-- Each migration runs inside a transaction automatically.

-- Examples:
--   ALTER TABLE transactions ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;
--   CREATE TABLE IF NOT EXISTS media_movies ( ... );
--   CREATE INDEX IF NOT EXISTS idx_name ON table(column);

-- ============================================================
-- Rollback (manual — document steps, do not automate)
-- ============================================================

-- SQLite has limited ALTER TABLE support. Document how to undo:
--
-- To rollback:
--   1. <step>
--   2. <step>
--   3. DELETE FROM schema_migrations WHERE version = 'YYYYMMDDHHMMSS_domain_description.sql';
