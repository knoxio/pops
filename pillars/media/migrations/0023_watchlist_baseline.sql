CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`priority` integer DEFAULT 0,
	`notes` text,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`plex_rating_key` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlist_media` ON `watchlist` (`media_type`,`media_id`);
