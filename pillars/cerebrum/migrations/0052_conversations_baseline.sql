-- Cerebrum pillar baseline for the conversations slice (PRD-182 US-01).
--
-- Mirrors the conversations / messages / conversation_context schema as it
-- stands in the shared pops.db (canonical definitions in
-- `packages/db-types/src/schema/ego.ts`). Column definitions and indexes
-- are copied verbatim so a fresh cerebrum.db matches the shared shape
-- byte-for-byte; the boot-time backfill ATTACHes pops.db and copies rows
-- across without column-rename gymnastics.
--
-- Conversations are chat-with-cerebrum sessions: stored prompts, model
-- responses, and references to engrams via the `conversation_context`
-- junction table. Append-only message stream per conversation; deletes
-- cascade from `conversations` to both `messages` and
-- `conversation_context`. The chat orchestration (streaming, model
-- selection, scope negotiation, auto-titling heuristics) stays in
-- `apps/pops-api/src/modules/cerebrum/ego/*` until PRD-182 PR 3 flips
-- routing through `getCerebrumDrizzle()`.

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
