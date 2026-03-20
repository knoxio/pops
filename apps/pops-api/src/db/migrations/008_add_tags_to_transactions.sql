-- Migration 008: Add tags column to transactions
-- Required for the tag editor feature. Fresh DBs get this via init-db.ts;
-- existing DBs need this ALTER TABLE.

ALTER TABLE transactions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
