CREATE TABLE `dismissed_discover` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`dismissed_at` text DEFAULT (datetime('now')) NOT NULL
);
