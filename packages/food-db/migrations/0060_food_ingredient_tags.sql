-- Theme-13 Wave-5 PR4 ingredients slice — schema parity with pops.db ahead of
-- the writer cutover.
--
-- 1. `ingredient_tags` is a brand-new table on the food-db side. The pops.db
--    side picked it up in `0070_prd_151_ingredient_tags.sql`; the column /
--    index shape matches that migration byte-for-byte so backfilled rows land
--    intact.
-- 2. `ingredient_variants` was created in `0058_high_sentinel.sql` without the
--    shelf-life columns; pops.db's `0060_familiar_leo.sql` later ALTERed them
--    in. Replay those ALTERs here so the food-db table matches the drizzle
--    schema and `SELECT *` reads through `getFoodDrizzle()` don't trip on
--    missing columns.
CREATE TABLE `ingredient_tags` (
	`ingredient_id` integer NOT NULL,
	`tag` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`ingredient_id`, `tag`),
	FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Case-insensitive index — the autocomplete picker filters by partial match
-- without forcing the writer to remember the canonical casing.
CREATE INDEX `idx_ingredient_tags_tag` ON `ingredient_tags` (`tag` COLLATE NOCASE);--> statement-breakpoint
-- Expression index over the namespace prefix (segment before the first `:`).
-- PRD-152's generator runs `WHERE tag LIKE 'store-section:%'` per recipe-line;
-- the expression index lets SQLite skip the table scan. `WHERE INSTR(tag, ':')
-- > 0` keeps the index sparse — namespace-less tags don't bloat it.
CREATE INDEX `idx_ingredient_tags_namespace` ON `ingredient_tags` (SUBSTR(`tag`, 1, INSTR(`tag` || ':', ':') - 1)) WHERE INSTR(`tag`, ':') > 0;--> statement-breakpoint
ALTER TABLE `ingredient_variants` ADD `default_shelf_life_days_fridge` integer;--> statement-breakpoint
ALTER TABLE `ingredient_variants` ADD `default_shelf_life_days_freezer` integer;
