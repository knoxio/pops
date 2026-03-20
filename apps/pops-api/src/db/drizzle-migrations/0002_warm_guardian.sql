CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`priority` integer DEFAULT 0,
	`notes` text,
	`added_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watchlist_media` ON `watchlist` (`media_type`,`media_id`);--> statement-breakpoint
CREATE INDEX `idx_watchlist_media_type` ON `watchlist` (`media_type`);--> statement-breakpoint
CREATE TABLE `watch_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`watched_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watch_history_media` ON `watch_history` (`media_type`,`media_id`);--> statement-breakpoint
CREATE INDEX `idx_watch_history_watched_at` ON `watch_history` (`watched_at`);