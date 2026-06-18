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
CREATE UNIQUE INDEX `uq_ai_model_pricing_provider_model` ON `ai_model_pricing` (`provider_id`,`model_id`);
