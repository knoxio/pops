-- Rename ai_usage to ai_inference_log and extend with observability columns.
-- Backfills existing rows with Claude/entity-match defaults.
-- Creates ai_providers, ai_model_pricing, ai_budgets tables.
-- Seeds Claude provider with default model pricing.

ALTER TABLE `ai_usage` RENAME TO `ai_inference_log`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_ai_usage_created_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_ai_usage_batch`;
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `provider` text NOT NULL DEFAULT 'claude';
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `model` text NOT NULL DEFAULT 'claude-haiku-4-5-20251001';
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `operation` text NOT NULL DEFAULT 'entity-match';
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `domain` text DEFAULT 'finance';
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `latency_ms` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `status` text NOT NULL DEFAULT 'success';
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `context_id` text;
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `error_message` text;
--> statement-breakpoint
ALTER TABLE `ai_inference_log` ADD `metadata` text;
--> statement-breakpoint
UPDATE `ai_inference_log` SET `context_id` = `import_batch_id` WHERE `import_batch_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_created_at` ON `ai_inference_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_provider_model` ON `ai_inference_log` (`provider`,`model`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_operation` ON `ai_inference_log` (`operation`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_domain` ON `ai_inference_log` (`domain`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_context_id` ON `ai_inference_log` (`context_id`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_status` ON `ai_inference_log` (`status`);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `base_url` text,
  `api_key_ref` text,
  `status` text NOT NULL DEFAULT 'active',
  `last_health_check` text,
  `last_latency_ms` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_model_pricing` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider_id` text NOT NULL,
  `model_id` text NOT NULL,
  `display_name` text,
  `input_cost_per_mtok` real NOT NULL DEFAULT 0,
  `output_cost_per_mtok` real NOT NULL DEFAULT 0,
  `context_window` integer,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  UNIQUE(`provider_id`, `model_id`)
);
--> statement-breakpoint
CREATE TABLE `ai_budgets` (
  `id` text PRIMARY KEY NOT NULL,
  `scope_type` text NOT NULL,
  `scope_value` text,
  `monthly_token_limit` integer,
  `monthly_cost_limit` real,
  `action` text NOT NULL DEFAULT 'warn',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `ai_providers` (`id`, `name`, `type`, `api_key_ref`, `status`, `created_at`, `updated_at`)
VALUES ('claude', 'Anthropic Claude', 'cloud', 'anthropic.apiKey', 'active', datetime('now'), datetime('now'));
--> statement-breakpoint
INSERT OR IGNORE INTO `ai_model_pricing` (`provider_id`, `model_id`, `display_name`, `input_cost_per_mtok`, `output_cost_per_mtok`, `context_window`, `is_default`, `created_at`, `updated_at`)
VALUES
  ('claude', 'claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 1.0, 5.0, 200000, 1, datetime('now'), datetime('now')),
  ('claude', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 3.0, 15.0, 200000, 0, datetime('now'), datetime('now')),
  ('claude', 'claude-opus-4-20250514', 'Claude Opus 4', 15.0, 75.0, 200000, 0, datetime('now'), datetime('now'));
