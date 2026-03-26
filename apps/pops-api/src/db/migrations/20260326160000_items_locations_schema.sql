-- Add missing columns to home_inventory and missing indexes to both tables.
-- purchase_price: distinct from replacement_value (what was paid vs current value)
-- created_at/updated_at: audit timestamps with sensible defaults for existing rows
-- condition default: 'good' for new rows
ALTER TABLE home_inventory ADD COLUMN purchase_price REAL;
ALTER TABLE home_inventory ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
ALTER TABLE home_inventory ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Add warranty_expires index for expiry queries
CREATE INDEX IF NOT EXISTS idx_inventory_warranty ON home_inventory(warranty_expires);

-- Add composite index on locations for ordered children queries
CREATE INDEX IF NOT EXISTS idx_locations_parent_sort ON locations(parent_id, sort_order);
