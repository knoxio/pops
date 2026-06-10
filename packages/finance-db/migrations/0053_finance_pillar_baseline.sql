-- Finance pillar baseline (synthetic — not in the shared journal).
--
-- The 4 existing finance migrations (0025/0026/0027/0052) ALTER or
-- recreate tables created in the pre-modular baseline
-- `0000_naive_chameleon.sql`. When the package journal applies to a
-- fresh finance.db (per-pillar runner, no shared baseline available),
-- those ALTERs fail because the dependent tables don't exist yet.
--
-- This entry creates the four required tables ahead of 0025 so the
-- package journal is self-bootstrapping for a fresh per-pillar file.
-- When the shared runner applies the same package journal against the
-- legacy shared pops.db (transitional release-cycle window), the
-- CREATE statements no-op via `isAlreadyAppliedError` and the hash is
-- recorded — same backfill mechanic inventory's `0006_inventory_pillar_baseline`
-- relies on (#2792).
--
-- Statements are sourced from
-- `apps/pops-api/src/db/drizzle-migrations/0000_naive_chameleon.sql`.
-- File-level layout differs (statement-breakpoint placement, table
-- ordering scoped to the finance-owned set) but each CREATE TABLE /
-- CREATE INDEX body matches the shared baseline so the resulting
-- schema is identical.

CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT 'company' NOT NULL,
	`abn` text,
	`aliases` text,
	`default_transaction_type` text,
	`default_tags` text,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_notion_id_unique` ON `entities` (`notion_id`);
--> statement-breakpoint
CREATE TABLE `transaction_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`description_pattern` text NOT NULL,
	`match_type` text DEFAULT 'exact' NOT NULL,
	`entity_id` text,
	`entity_name` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`transaction_type` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`times_applied` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_corrections_pattern` ON `transaction_corrections` (`description_pattern`);
--> statement-breakpoint
CREATE INDEX `idx_corrections_confidence` ON `transaction_corrections` (`confidence`);
--> statement-breakpoint
CREATE INDEX `idx_corrections_times_applied` ON `transaction_corrections` (`times_applied`);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`category` text NOT NULL,
	`period` text,
	`amount` real,
	`active` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_notion_id_unique` ON `budgets` (`notion_id`);
--> statement-breakpoint
CREATE TABLE `wish_list` (
	`id` text PRIMARY KEY NOT NULL,
	`notion_id` text,
	`item` text NOT NULL,
	`target_amount` real,
	`saved` real,
	`priority` text,
	`url` text,
	`notes` text,
	`last_edited_time` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wish_list_notion_id_unique` ON `wish_list` (`notion_id`);
