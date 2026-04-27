-- Ego conversation persistence tables.
-- conversations: chat session metadata
-- messages: individual messages within a conversation
-- conversation_context: engram references loaded during conversation

CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`active_scopes` text NOT NULL,
	`app_context` text,
	`model` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_created_at` ON `conversations` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_conversations_updated_at` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`citations` text,
	`tool_calls` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_context` (
	`conversation_id` text NOT NULL,
	`engram_id` text NOT NULL,
	`relevance_score` real,
	`loaded_at` text NOT NULL,
	PRIMARY KEY(`conversation_id`, `engram_id`),
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_context_conversation` ON `conversation_context` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `idx_conversation_context_engram` ON `conversation_context` (`engram_id`);
