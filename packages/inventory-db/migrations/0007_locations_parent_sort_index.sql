-- Inventory pillar — backfill missing index from shared journal 0009_red_quasimodo.
-- The shared journal added this composite index on locations(parent_id, sort_order)
-- to accelerate the tree-listing query; the inventory baseline (0006) missed it.
-- Surfaced by the Q1 schema-coverage CI (#2917).
CREATE INDEX IF NOT EXISTS `idx_locations_parent_sort` ON `locations` (`parent_id`,`sort_order`);
