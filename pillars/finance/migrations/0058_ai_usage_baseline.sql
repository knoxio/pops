-- Finance pillar — gap #3489: re-home the finance-categorizer `ai_usage` table
-- from core.
--
-- `ai_usage` records per-description AI categorization usage (tokens, cost,
-- cache hits) keyed by import batch. It is finance-categorizer state, not
-- AI-ops telemetry (that slice lives in the `ai` pillar), so it belongs in the
-- finance DB. DDL mirrors core's historical `0061_ai_usage` verbatim — no
-- column renames — so the one-shot `migrate-ai-usage` data migration can copy
-- rows across without transformation.
--
-- `IF NOT EXISTS` keeps the migration idempotent when the package journal
-- applies against a finance.db that already carries the table (parity with
-- `0056_settings_baseline`).

CREATE TABLE IF NOT EXISTS `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`entity_name` text,
	`category` text,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`cached` integer DEFAULT 0 NOT NULL,
	`import_batch_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_usage_created_at` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_usage_batch` ON `ai_usage` (`import_batch_id`);
