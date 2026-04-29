-- Safety migration: create glia_actions and glia_trust_state tables if they
-- were missed during fresh-database initialisation (issue #2330).
-- Uses CREATE TABLE IF NOT EXISTS so it is safe to run against databases
-- that already have the tables.
CREATE TABLE IF NOT EXISTS `glia_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`action_type` text NOT NULL,
	`affected_ids` text NOT NULL,
	`rationale` text NOT NULL,
	`payload` text,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`user_decision` text,
	`user_note` text,
	`executed_at` text,
	`decided_at` text,
	`reverted_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_glia_actions_action_type` ON `glia_actions` (`action_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_glia_actions_status` ON `glia_actions` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_glia_actions_phase` ON `glia_actions` (`phase`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_glia_actions_created_at` ON `glia_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `glia_trust_state` (
	`action_type` text PRIMARY KEY NOT NULL,
	`current_phase` text NOT NULL,
	`approved_count` integer NOT NULL DEFAULT 0,
	`rejected_count` integer NOT NULL DEFAULT 0,
	`reverted_count` integer NOT NULL DEFAULT 0,
	`autonomous_since` text,
	`last_revert_at` text,
	`graduated_at` text,
	`updated_at` text NOT NULL
);
