-- Safety migration: add body_hash column to engram_index if it was missed
-- during fresh-database initialisation (issue #2329). The column should have
-- been added by migration 0036_body_hash_engram_index but databases
-- bootstrapped before that migration ran may be missing it.
-- Drizzle's migration runner skips already-applied migrations (tracked in
-- __drizzle_migrations), so this will not double-run on up-to-date databases.
ALTER TABLE `engram_index` ADD COLUMN `body_hash` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_engram_index_body_hash` ON `engram_index` (`body_hash`);
