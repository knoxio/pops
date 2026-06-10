CREATE TABLE `nudge_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`engram_ids` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	`acted_at` text,
	`action_type` text,
	`action_label` text,
	`action_params` text
);
--> statement-breakpoint
CREATE INDEX `idx_nudge_log_type` ON `nudge_log` (`type`);--> statement-breakpoint
CREATE INDEX `idx_nudge_log_status` ON `nudge_log` (`status`);--> statement-breakpoint
CREATE INDEX `idx_nudge_log_priority` ON `nudge_log` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_nudge_log_created_at` ON `nudge_log` (`created_at`);