CREATE TABLE `service_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_accounts_name_unique` ON `service_accounts` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_accounts_key_prefix_unique` ON `service_accounts` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `idx_service_accounts_key_prefix` ON `service_accounts` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `idx_service_accounts_revoked_at` ON `service_accounts` (`revoked_at`);