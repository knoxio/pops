-- Cerebrum pillar baseline for the engrams slice (PRD-179 US-01).
--
-- Mirrors the engram_index / engram_scopes / engram_tags / engram_links
-- schema as it stands in the shared pops.db after all body_hash patches
-- (0031_romantic_hannibal_king + 0036_body_hash_engram_index). Column
-- definitions and indexes are copied verbatim so a fresh cerebrum.db
-- matches the shared shape byte-for-byte; the boot-time backfill ATTACHes
-- pops.db and copies rows across without column-rename gymnastics.
--
-- The `embeddings_vec` virtual table is NOT created via this migration —
-- it requires the sqlite-vec extension and is created imperatively by
-- `ensureEmbeddingsVecTable` after the extension loads in
-- `openCerebrumDb`. Drizzle's schema builder can't express virtual
-- tables, and keeping the create-virtual-table call out of the migration
-- journal lets the engrams baseline still succeed on builds where
-- sqlite-vec isn't available (engram CRUD + scopes/tags/links work
-- without it).

CREATE TABLE `engram_index` (
	`id` text PRIMARY KEY NOT NULL,
	`file_path` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`template` text,
	`created_at` text NOT NULL,
	`modified_at` text NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`body_hash` text,
	`word_count` integer NOT NULL,
	`custom_fields` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `engram_index_file_path_unique` ON `engram_index` (`file_path`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_type` ON `engram_index` (`type`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_source` ON `engram_index` (`source`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_status` ON `engram_index` (`status`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_created_at` ON `engram_index` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_content_hash` ON `engram_index` (`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_engram_index_body_hash` ON `engram_index` (`body_hash`);--> statement-breakpoint
CREATE TABLE `engram_links` (
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `engram_index`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_engram_links_target` ON `engram_links` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_engram_links_pair` ON `engram_links` (`source_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `engram_scopes` (
	`engram_id` text NOT NULL,
	`scope` text NOT NULL,
	FOREIGN KEY (`engram_id`) REFERENCES `engram_index`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_engram_scopes_scope` ON `engram_scopes` (`scope`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_engram_scopes_pair` ON `engram_scopes` (`engram_id`,`scope`);--> statement-breakpoint
CREATE TABLE `engram_tags` (
	`engram_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`engram_id`) REFERENCES `engram_index`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_engram_tags_tag` ON `engram_tags` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_engram_tags_pair` ON `engram_tags` (`engram_id`,`tag`);
