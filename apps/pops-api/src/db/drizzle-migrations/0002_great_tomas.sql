CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`tvdb_id` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`air_date` text,
	`still_path` text,
	`vote_average` real,
	`runtime` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_episodes_tvdb_id` ON `episodes` (`tvdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_episodes_season_number` ON `episodes` (`season_id`,`episode_number`);--> statement-breakpoint
CREATE INDEX `idx_episodes_season_id` ON `episodes` (`season_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tv_show_id` integer NOT NULL,
	`tvdb_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`name` text,
	`overview` text,
	`poster_path` text,
	`air_date` text,
	`episode_count` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`tv_show_id`) REFERENCES `tv_shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seasons_tvdb_id` ON `seasons` (`tvdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_seasons_show_number` ON `seasons` (`tv_show_id`,`season_number`);--> statement-breakpoint
CREATE INDEX `idx_seasons_tv_show_id` ON `seasons` (`tv_show_id`);