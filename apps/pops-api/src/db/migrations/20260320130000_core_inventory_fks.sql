-- Migration: 20260320130000_core_inventory_fks.sql
-- Domain: core
-- Description: Add foreign key constraints to home_inventory table for
--   purchase_transaction_id → transactions(id) and purchased_from_id → entities(id).
--   SQLite cannot add FK constraints to existing columns, so this migration
--   recreates the table with constraints using the rename-and-copy pattern.
--
-- What it changes:
--   - Recreates home_inventory with FK constraints (ON DELETE SET NULL)
--   - Nullifies any orphaned FK references before applying constraints
--
-- Rollback (manual):
--   -- Recreate home_inventory without FK constraints using the same
--   -- rename-and-copy pattern.

-- First, null out any orphaned references so the FK constraints won't fail
UPDATE home_inventory SET purchase_transaction_id = NULL
  WHERE purchase_transaction_id IS NOT NULL
    AND purchase_transaction_id NOT IN (SELECT id FROM transactions);

UPDATE home_inventory SET purchased_from_id = NULL
  WHERE purchased_from_id IS NOT NULL
    AND purchased_from_id NOT IN (SELECT id FROM entities);

-- Rename existing table
ALTER TABLE home_inventory RENAME TO _home_inventory_old;

-- Create new table with FK constraints
CREATE TABLE home_inventory (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  notion_id TEXT UNIQUE,
  item_name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  item_id TEXT,
  room TEXT,
  location TEXT,
  type TEXT,
  condition TEXT,
  in_use INTEGER,
  deductible INTEGER,
  purchase_date TEXT,
  warranty_expires TEXT,
  replacement_value REAL,
  resale_value REAL,
  purchase_transaction_id TEXT,
  purchased_from_id TEXT,
  purchased_from_name TEXT,
  last_edited_time TEXT NOT NULL,
  FOREIGN KEY (purchase_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (purchased_from_id) REFERENCES entities(id) ON DELETE SET NULL
);

-- Copy data from old table
INSERT INTO home_inventory SELECT * FROM _home_inventory_old;

-- Drop old table
DROP TABLE _home_inventory_old;
