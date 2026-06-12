CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`title` text NOT NULL,
	`original_title` text,
	`overview` text,
	`tagline` text,
	`release_date` text,
	`runtime` integer,
	`status` text,
	`original_language` text,
	`budget` integer,
	`revenue` integer,
	`poster_path` text,
	`backdrop_path` text,
	`logo_path` text,
	`poster_override_path` text,
	`discover_rating_key` text,
	`vote_average` real,
	`vote_count` integer,
	`genres` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`rotation_status` text,
	`rotation_expires_at` text,
	`rotation_marked_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_movies_rotation_status` ON `movies` (`rotation_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_movies_tmdb_id` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_title` ON `movies` (`title`);--> statement-breakpoint
CREATE INDEX `idx_movies_release_date` ON `movies` (`release_date`);