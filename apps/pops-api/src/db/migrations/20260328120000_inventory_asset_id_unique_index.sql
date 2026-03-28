-- Make idx_inventory_asset_id a UNIQUE index.
-- The column already has a UNIQUE constraint, so this makes the named index
-- consistent with the column-level uniqueness enforcement.
DROP INDEX IF EXISTS idx_inventory_asset_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_asset_id ON home_inventory(asset_id);
