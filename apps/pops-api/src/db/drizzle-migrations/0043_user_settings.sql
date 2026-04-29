-- Per-user preferences (PRD-094 US-05).
CREATE TABLE `user_settings` (
	`user_email` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_email`, `key`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_settings_user` ON `user_settings` (`user_email`);
