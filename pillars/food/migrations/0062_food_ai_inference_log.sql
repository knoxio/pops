CREATE TABLE "ai_inference_log" (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `operation` text NOT NULL,
  `domain` text,
  `input_tokens` integer NOT NULL DEFAULT 0,
  `output_tokens` integer NOT NULL DEFAULT 0,
  `cost_usd` real NOT NULL DEFAULT 0,
  `latency_ms` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'success',
  `cached` integer NOT NULL DEFAULT 0,
  `context_id` text,
  `error_message` text,
  `metadata` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_context_id` ON `ai_inference_log` (`context_id`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_created_at` ON `ai_inference_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_domain` ON `ai_inference_log` (`domain`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_operation` ON `ai_inference_log` (`operation`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_provider_model` ON `ai_inference_log` (`provider`, `model`);
--> statement-breakpoint
CREATE INDEX `idx_ai_inference_log_status` ON `ai_inference_log` (`status`);
