-- Cerebrum pillar baseline for the reflex slice (PRD-089 reflex execution
-- log). The append-only `reflex_executions` table was declared in the
-- pillar schema (`schema/reflex-executions.ts`) but never had its own
-- migration in the relocated journal — this baseline creates it.
--
-- IF NOT EXISTS throughout so the migration is safe to run against a
-- database that already received the table from an earlier shared-journal
-- ancestry.
CREATE TABLE IF NOT EXISTS `reflex_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`reflex_name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`trigger_data` text,
	`action_type` text NOT NULL,
	`action_verb` text NOT NULL,
	`status` text NOT NULL,
	`result` text,
	`triggered_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reflex_exec_name` ON `reflex_executions` (`reflex_name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reflex_exec_trigger_type` ON `reflex_executions` (`trigger_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reflex_exec_status` ON `reflex_executions` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_reflex_exec_triggered_at` ON `reflex_executions` (`triggered_at`);
