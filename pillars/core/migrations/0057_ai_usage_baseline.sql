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
