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
