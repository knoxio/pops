-- Media pillar baseline for tier_overrides — the persisted per-(media,dimension)
-- tier placement that hydrates a tier-list round and survives ELO recalculation.
-- Mirrors the shared `pops.db` ancestry (`0019_little_diamondback`). Carried over
-- with the comparisons domain port; the comparisons cluster (0029/0032) created
-- everything except this side table.

CREATE TABLE `tier_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`tier` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tier_overrides_unique` ON `tier_overrides` (`media_type`,`media_id`,`dimension_id`);
