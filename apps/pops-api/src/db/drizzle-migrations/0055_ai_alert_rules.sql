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
CREATE INDEX `idx_ai_alert_rules_enabled` ON `ai_alert_rules` (`enabled`);--> statement-breakpoint
CREATE TABLE `ai_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`severity` text NOT NULL,
	`scope_detail` text,
	`metric_value` real NOT NULL,
	`threshold_value` real NOT NULL,
	`acknowledged` integer DEFAULT 0 NOT NULL,
	`acknowledged_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `ai_alert_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ai_alerts_created_at` ON `ai_alerts` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_alerts_type` ON `ai_alerts` (`type`);--> statement-breakpoint
CREATE INDEX `idx_ai_alerts_severity` ON `ai_alerts` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_ai_alerts_acknowledged` ON `ai_alerts` (`acknowledged`);--> statement-breakpoint
CREATE INDEX `idx_ai_alerts_dedupe` ON `ai_alerts` (`type`,`scope_detail`,`created_at`);