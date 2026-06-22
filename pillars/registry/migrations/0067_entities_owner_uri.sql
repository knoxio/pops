-- Core pillar — PRD-251 US-03 cross-pillar denorm (finance-side half).
--
-- `entities` (core-owned per PRD-245 US-07) gets the URI-shaped owner
-- reference + `staleAt` marker that the finance reconciliation cron
-- (apps/pops-finance-api/src/cron/reconcile-cross-pillar.ts) reads
-- when walking distinct owner URIs across the finance pair (budgets +
-- entities). Writes to this column come from the owning pillar only,
-- per the PRD's "owner-side writes only" rule.
--
-- The `IF NOT EXISTS` table creation is a baseline-on-demand: PRD-245
-- US-07 relocated the `entities` table from `@pops/db-types` to this
-- package but kept the migration in the legacy shared journal. Fresh
-- per-pillar `core.db` files have no `entities` table yet, so the
-- table is created first; production `core.db` files (which inherited
-- `entities` from the shared pops.db) skip the CREATE and only run
-- the ALTERs. Once both are reconciled, follow-up PRDs can lift the
-- canonical CREATE out of here.

CREATE TABLE IF NOT EXISTS `entities` (
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
CREATE UNIQUE INDEX IF NOT EXISTS `entities_notion_id_unique` ON `entities` (`notion_id`);
--> statement-breakpoint
ALTER TABLE `entities` ADD COLUMN `owner_uri` text;
--> statement-breakpoint
ALTER TABLE `entities` ADD COLUMN `owner_uri_stale_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_entities_owner_uri` ON `entities` (`owner_uri`);
