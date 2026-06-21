CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_inference_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`domain` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`cached` integer DEFAULT 0 NOT NULL,
	`context_id` text,
	`error_message` text,
	`metadata` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_created_at` ON `ai_inference_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_provider_model` ON `ai_inference_log` (`provider`,`model`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_operation` ON `ai_inference_log` (`operation`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_domain` ON `ai_inference_log` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_context_id` ON `ai_inference_log` (`context_id`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_status` ON `ai_inference_log` (`status`);--> statement-breakpoint
CREATE TABLE `ai_inference_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`operation` text NOT NULL,
	`domain` text,
	`total_calls` integer DEFAULT 0 NOT NULL,
	`total_input_tokens` integer DEFAULT 0 NOT NULL,
	`total_output_tokens` integer DEFAULT 0 NOT NULL,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`avg_latency_ms` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`timeout_count` integer DEFAULT 0 NOT NULL,
	`cache_hit_count` integer DEFAULT 0 NOT NULL,
	`budget_blocked_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_inference_daily_key` ON `ai_inference_daily` (`date`,`provider`,`model`,`operation`,`domain`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_daily_date` ON `ai_inference_daily` (`date`);--> statement-breakpoint
CREATE INDEX `idx_ai_inference_daily_provider_model` ON `ai_inference_daily` (`provider`,`model`);--> statement-breakpoint
CREATE TABLE `ai_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_value` text,
	`monthly_token_limit` integer,
	`monthly_cost_limit` real,
	`action` text DEFAULT 'warn' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_model_pricing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`display_name` text,
	`input_cost_per_mtok` real DEFAULT 0 NOT NULL,
	`output_cost_per_mtok` real DEFAULT 0 NOT NULL,
	`context_window` integer,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ai_model_pricing_provider_model` ON `ai_model_pricing` (`provider_id`,`model_id`);--> statement-breakpoint
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
CREATE INDEX `idx_ai_alerts_dedupe` ON `ai_alerts` (`type`,`scope_detail`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`base_url` text,
	`api_key_ref` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_health_check` text,
	`last_latency_ms` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_providers_type` ON `ai_providers` (`type`);--> statement-breakpoint
CREATE INDEX `idx_ai_providers_status` ON `ai_providers` (`status`);
