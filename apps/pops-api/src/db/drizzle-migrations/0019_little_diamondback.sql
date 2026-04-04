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