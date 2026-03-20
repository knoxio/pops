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
	`vote_average` real,
	`vote_count` integer,
	`genres` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_movies_tmdb_id` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_title` ON `movies` (`title`);--> statement-breakpoint
CREATE INDEX `idx_movies_release_date` ON `movies` (`release_date`);--> statement-breakpoint
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
	`vote_average` real,
	`vote_count` integer,
	`genres` text,
	`networks` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tv_shows_tvdb_id_unique` ON `tv_shows` (`tvdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tv_shows_tvdb_id` ON `tv_shows` (`tvdb_id`);--> statement-breakpoint
CREATE INDEX `idx_tv_shows_name` ON `tv_shows` (`name`);--> statement-breakpoint
CREATE INDEX `idx_tv_shows_first_air_date` ON `tv_shows` (`first_air_date`);