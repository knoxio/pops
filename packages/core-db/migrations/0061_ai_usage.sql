CREATE TABLE `ai_usage` (
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
CREATE INDEX `idx_ai_usage_created_at` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_batch` ON `ai_usage` (`import_batch_id`);
