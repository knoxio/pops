-- Daily aggregation table for `ai_inference_log` (PRD-092 US-08).
-- The retention job rolls aged-out raw rows into one summary row per
-- (date, provider, model, operation, domain) and deletes the originals.
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to run against databases
-- that already have the table.
CREATE TABLE IF NOT EXISTS `ai_inference_daily` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `idx_ai_inference_daily_key` ON `ai_inference_daily` (`date`,`provider`,`model`,`operation`,`domain`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_inference_daily_date` ON `ai_inference_daily` (`date`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_inference_daily_provider_model` ON `ai_inference_daily` (`provider`,`model`);
