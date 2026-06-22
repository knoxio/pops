-- Finance pillar — PRD-163 US-03 (contacts plan N3): drop the entities mirror.
--
-- Entities are now owned by the contacts pillar. Finance no longer mirrors the
-- `entities` table — the import matcher and entity-usage rollup fetch the
-- contact set live from contacts and join in memory. Transactions now carry a
-- contacts entity id in `entity_id`, which is NOT present in any local table, so
-- the legacy `FOREIGN KEY (entity_id) REFERENCES entities(id)` constraints on
-- `transactions` / `transaction_corrections` / `transaction_tag_rules` must go
-- (otherwise an insert with `foreign_keys = ON` fails once `entities` is gone).
--
-- SQLite can't DROP a constraint in place, so each table is rebuilt without the
-- FK (the new tables have no FK, so copying the existing valid rows is safe
-- even with `foreign_keys = ON`), then `entities` is dropped last. Column lists
-- mirror the drizzle schemas verbatim.

CREATE TABLE `__new_transactions` (
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
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_transactions` SELECT `id`, `notion_id`, `description`, `account`, `amount`, `date`, `type`, `tags`, `entity_id`, `entity_name`, `location`, `country`, `related_transaction_id`, `notes`, `checksum`, `raw_row`, `last_edited_time` FROM `transactions`;
--> statement-breakpoint
DROP TABLE `transactions`;
--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;
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
CREATE TABLE `__new_transaction_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`transaction_type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
INSERT INTO `__new_transaction_corrections` SELECT `id`, `description_pattern`, `match_type`, `entity_id`, `entity_name`, `location`, `tags`, `transaction_type`, `is_active`, `confidence`, `priority`, `times_applied`, `created_at`, `last_used_at` FROM `transaction_corrections`;
--> statement-breakpoint
DROP TABLE `transaction_corrections`;
--> statement-breakpoint
ALTER TABLE `__new_transaction_corrections` RENAME TO `transaction_corrections`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_pattern` ON `transaction_corrections` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_confidence` ON `transaction_corrections` (`confidence`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_times_applied` ON `transaction_corrections` (`times_applied`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_corrections_priority` ON `transaction_corrections` (`priority`);
--> statement-breakpoint
CREATE TABLE `__new_transaction_tag_rules` (
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
	`last_used_at` text
);
--> statement-breakpoint
INSERT INTO `__new_transaction_tag_rules` SELECT `id`, `description_pattern`, `match_type`, `entity_id`, `tags`, `is_active`, `confidence`, `priority`, `times_applied`, `created_at`, `last_used_at` FROM `transaction_tag_rules`;
--> statement-breakpoint
DROP TABLE `transaction_tag_rules`;
--> statement-breakpoint
ALTER TABLE `__new_transaction_tag_rules` RENAME TO `transaction_tag_rules`;
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
DROP TABLE `entities`;
