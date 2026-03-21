-- Migration: 20260320140000_inventory_new_columns.sql
-- Domain: core
-- Description: Add asset_id, notes, location_id columns to home_inventory,
--   create locations, item_connections, item_photos tables.
--   Uses SQLite rename-and-copy pattern since we need FK constraint on location_id.
--
-- What it changes:
--   - Adds locations table (must exist before home_inventory FK)
--   - Recreates home_inventory with asset_id, notes, location_id columns
--   - Creates item_connections and item_photos tables
--
-- Rollback (manual):
--   -- Drop new tables, recreate home_inventory without new columns

-- Create locations table first (home_inventory references it)
CREATE TABLE IF NOT EXISTS locations (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name       TEXT NOT NULL,
  parent_id  TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);

-- Rename existing home_inventory
ALTER TABLE home_inventory RENAME TO _home_inventory_old;

-- Create new home_inventory with asset_id, notes, location_id columns
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
  asset_id TEXT UNIQUE,
  notes TEXT,
  location_id TEXT,
  FOREIGN KEY (purchase_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  FOREIGN KEY (purchased_from_id) REFERENCES entities(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

-- Copy data from old table (new columns get NULL defaults)
INSERT INTO home_inventory (
  id, notion_id, item_name, brand, model, item_id, room, location,
  type, condition, in_use, deductible, purchase_date, warranty_expires,
  replacement_value, resale_value, purchase_transaction_id,
  purchased_from_id, purchased_from_name, last_edited_time
)
SELECT
  id, notion_id, item_name, brand, model, item_id, room, location,
  type, condition, in_use, deductible, purchase_date, warranty_expires,
  replacement_value, resale_value, purchase_transaction_id,
  purchased_from_id, purchased_from_name, last_edited_time
FROM _home_inventory_old;

-- Drop old table
DROP TABLE _home_inventory_old;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_inventory_asset_id ON home_inventory(asset_id);
CREATE INDEX IF NOT EXISTS idx_inventory_name ON home_inventory(item_name);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON home_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON home_inventory(type);

-- Create item_connections table
CREATE TABLE IF NOT EXISTS item_connections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_a_id  TEXT NOT NULL,
  item_b_id  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_a_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (item_b_id) REFERENCES home_inventory(id) ON DELETE CASCADE,
  CHECK (item_a_id < item_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_connections_pair ON item_connections(item_a_id, item_b_id);
CREATE INDEX IF NOT EXISTS idx_item_connections_a ON item_connections(item_a_id);
CREATE INDEX IF NOT EXISTS idx_item_connections_b ON item_connections(item_b_id);

-- Create item_photos table
CREATE TABLE IF NOT EXISTS item_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  caption    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES home_inventory(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_photos_item ON item_photos(item_id);
