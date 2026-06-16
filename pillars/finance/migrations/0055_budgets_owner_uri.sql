-- Finance pillar — PRD-251 US-03 cross-pillar denorm.
--
-- `budgets` gets a URI-shaped owner reference (`pops://core/<type>/<id>`)
-- plus a `staleAt` marker the reconciliation cron writes when the
-- owning pillar reports the URI no longer resolves. Both columns are
-- nullable so existing rows keep working — backfill from legacy join
-- columns happens here when possible (no legacy `owner_id` exists on
-- `budgets` today, so the backfill is a no-op and existing rows stay
-- NULL until a write populates `owner_uri`).
--
-- `entities` (re-exported from `@pops/core-db` per PRD-245 US-07) also
-- gets the same column pair because the finance package barrel re-uses
-- the core drizzle schema and finance.db keeps a local `entities` copy
-- for FK targets — keeping the columns in sync prevents drizzle from
-- complaining about the unknown column on every read. The canonical
-- ALTER for the core-owned `entities` table happens in core-db's
-- `0067_entities_owner_uri.sql`; this is the finance-side mirror.

ALTER TABLE `budgets` ADD COLUMN `owner_uri` text;
--> statement-breakpoint
ALTER TABLE `budgets` ADD COLUMN `owner_uri_stale_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_budgets_owner_uri` ON `budgets` (`owner_uri`);
--> statement-breakpoint
ALTER TABLE `entities` ADD COLUMN `owner_uri` text;
--> statement-breakpoint
ALTER TABLE `entities` ADD COLUMN `owner_uri_stale_at` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_entities_owner_uri` ON `entities` (`owner_uri`);
