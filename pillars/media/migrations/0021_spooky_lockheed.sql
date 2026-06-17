CREATE TABLE `shelf_impressions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shelf_id` text NOT NULL,
	`shown_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_shelf_impressions_shelf_id` ON `shelf_impressions` (`shelf_id`);