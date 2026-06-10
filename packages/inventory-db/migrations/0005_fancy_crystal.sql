CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_locations_parent` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_locations_name` ON `locations` (`name`);