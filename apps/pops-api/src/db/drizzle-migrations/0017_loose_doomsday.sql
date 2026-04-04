CREATE TABLE `comparison_staleness` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`staleness` real DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comparison_staleness_unique` ON `comparison_staleness` (`media_type`,`media_id`);