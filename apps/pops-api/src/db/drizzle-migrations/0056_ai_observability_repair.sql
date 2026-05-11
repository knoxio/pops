-- Repair migration for 0034_ai_observability (issue #2603).
--
-- 0034 was partially applied on prod: the ALTER TABLE rename + new
-- columns landed on ai_inference_log, but the three new tables
-- (ai_providers, ai_model_pricing, ai_budgets) and their seed rows
-- never made it. Cause: schema.ts's `initializeSchema(db)` had a
-- partial copy of the same schema and ran first on a fresh DB,
-- leaving 0034 unable to RENAME ai_usage (already renamed) — the
-- migration crashed before reaching the CREATE TABLE statements.
--
-- This repair re-applies the table + seed portions idempotently.
-- The ALTER TABLE / column-add portions of 0034 are not repeated;
-- they're already in place on prod.

CREATE TABLE IF NOT EXISTS `ai_providers` (
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
CREATE TABLE IF NOT EXISTS `ai_model_pricing` (
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
CREATE TABLE IF NOT EXISTS `ai_budgets` (
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
  ('claude', 'claude-sonnet-4-6', 'Claude Sonnet 4.6', 3.0, 15.0, 200000, 0, datetime('now'), datetime('now')),
  ('claude', 'claude-opus-4-20250514', 'Claude Opus 4', 15.0, 75.0, 200000, 0, datetime('now'), datetime('now'));
