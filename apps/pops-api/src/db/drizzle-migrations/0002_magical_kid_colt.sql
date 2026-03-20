CREATE TABLE `comparison_dimensions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_comparison_dimensions_name` ON `comparison_dimensions` (`name`);--> statement-breakpoint
CREATE TABLE `comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dimension_id` integer NOT NULL,
	`media_a_type` text NOT NULL,
	`media_a_id` integer NOT NULL,
	`media_b_type` text NOT NULL,
	`media_b_id` integer NOT NULL,
	`winner_type` text NOT NULL,
	`winner_id` integer NOT NULL,
	`compared_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comparisons_dimension_id` ON `comparisons` (`dimension_id`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_media_a` ON `comparisons` (`media_a_type`,`media_a_id`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_media_b` ON `comparisons` (`media_b_type`,`media_b_id`);--> statement-breakpoint
CREATE TABLE `media_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`score` real DEFAULT 1500 NOT NULL,
	`comparison_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dimension_id`) REFERENCES `comparison_dimensions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_scores_unique` ON `media_scores` (`media_type`,`media_id`,`dimension_id`);--> statement-breakpoint
CREATE INDEX `idx_media_scores_dimension` ON `media_scores` (`dimension_id`);