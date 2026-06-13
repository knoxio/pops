CREATE TABLE `ai_alert_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`scope_provider` text,
	`scope_model` text,
	`threshold_value` real NOT NULL,
	`window_minutes` integer,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_alert_rules_type` ON `ai_alert_rules` (`type`);--> statement-breakpoint
CREATE INDEX `idx_ai_alert_rules_enabled` ON `ai_alert_rules` (`enabled`);
