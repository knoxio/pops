CREATE TABLE `tv_shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tvdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`original_name` text,
	`overview` text,
	`first_air_date` text,
	`last_air_date` text,
	`status` text,
	`original_language` text,
	`number_of_seasons` integer,
	`number_of_episodes` integer,
	`episode_run_time` integer,
	`poster_path` text,
	`backdrop_path` text,
	`logo_path` text,
	`poster_override_path` text,
	`discover_rating_key` text,
	`vote_average` real,
	`vote_count` integer,
	`genres` text,
	`networks` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tv_shows_tvdb_id` ON `tv_shows` (`tvdb_id`);--> statement-breakpoint
CREATE INDEX `idx_tv_shows_name` ON `tv_shows` (`name`);--> statement-breakpoint
CREATE INDEX `idx_tv_shows_first_air_date` ON `tv_shows` (`first_air_date`);