-- Safety migration: create conversations, messages, and conversation_context
-- tables if they were missed during fresh-database initialisation (issue #2331).
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to run against databases
-- that already have the tables.
CREATE TABLE IF NOT EXISTS `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`active_scopes` text NOT NULL,
	`app_context` text,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversations_created_at` ON `conversations` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversations_updated_at` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL REFERENCES conversations(`id`) ON DELETE CASCADE,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`citations` text,
	`tool_calls` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_messages_conversation_created` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `conversation_context` (
	`conversation_id` text NOT NULL REFERENCES conversations(`id`) ON DELETE CASCADE,
	`engram_id` text NOT NULL,
	`relevance_score` real,
	`loaded_at` text NOT NULL,
	PRIMARY KEY (`conversation_id`, `engram_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_context_conversation` ON `conversation_context` (`conversation_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_conversation_context_engram` ON `conversation_context` (`engram_id`);
