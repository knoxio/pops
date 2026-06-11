-- Finance pillar baseline extension — adds the four finance-owned tables
-- absent from `0053_finance_pillar_baseline.sql`.
--
-- Track N4 (#2908) flipped `transaction_tag_rules` consumers to
-- `getFinanceDrizzle()`, but the underlying table only existed in the
-- shared pre-modular baseline (`0000_naive_chameleon.sql`) — a fresh
-- per-pillar `finance.db` populated solely by 0053 has no
-- `transactions`, `transaction_tag_rules`, or `tag_vocabulary` tables.
-- (`transaction_tag_rules` + `tag_vocabulary` were already created by
-- 0026 against the shared journal, but the older 0026 statements were
-- written without IF NOT EXISTS — replaying them in the package journal
-- against a DB where 0026 has already run would explode. They are
-- guarded here in case an older boot path created them before 0054
-- runs.)
--
-- Statements mirror
-- `apps/pops-api/src/db/drizzle-migrations/0000_naive_chameleon.sql` for
-- `transactions` and the drizzle schemas in `packages/db-types/src/schema/`
-- for the others. The FK on `transaction_tag_rules.entity_id` matches
-- migration 0026.
--
-- IF NOT EXISTS is used throughout because this migration runs against
-- production `finance.db` files that may already contain some of these
-- tables (created by the legacy boot path that pointed
-- `getFinanceDrizzle()` at the shared pops.db, or by an earlier
-- back-fill). Once drizzle records 0054 in `__drizzle_migrations` the
-- file is replay-skipped on every subsequent boot.

CREATE TABLE IF NOT EXISTS `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`description` text NOT NULL,
	`account` text NOT NULL,
	`amount` real NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`country` text,
	`related_transaction_id` text,
	`notes` text,
	`checksum` text,
	`raw_row` text,
	`last_edited_time` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `transactions_notion_id_unique` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_date` ON `transactions` (`date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_account` ON `transactions` (`account`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_entity` ON `transactions` (`entity_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_last_edited` ON `transactions` (`last_edited_time`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_transactions_notion_id` ON `transactions` (`notion_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_transactions_checksum` ON `transactions` (`checksum`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `transaction_tag_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_rules_pattern` ON `transaction_tag_rules` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_rules_entity_id` ON `transaction_tag_rules` (`entity_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_rules_priority` ON `transaction_tag_rules` (`priority`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_rules_confidence` ON `transaction_tag_rules` (`confidence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_rules_times_applied` ON `transaction_tag_rules` (`times_applied`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tag_vocabulary` (
	`tag` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'seed' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tag_vocabulary_active` ON `tag_vocabulary` (`is_active`);
