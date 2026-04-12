CREATE TABLE `rotation_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`executed_at` text NOT NULL,
	`movies_marked_leaving` integer NOT NULL,
	`movies_removed` integer NOT NULL,
	`movies_added` integer NOT NULL,
	`removals_failed` integer NOT NULL,
	`free_space_gb` real NOT NULL,
	`target_free_gb` real NOT NULL,
	`skipped_reason` text,
	`details` text
);
--> statement-breakpoint
ALTER TABLE `movies` ADD `rotation_status` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `rotation_expires_at` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `rotation_marked_at` text;--> statement-breakpoint
CREATE INDEX `idx_movies_rotation_status` ON `movies` (`rotation_status`);