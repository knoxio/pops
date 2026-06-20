-- Cerebrum pillar baseline for the embeddings slice (PRD-076 / theme-13).
--
-- Mirrors the embeddings metadata schema as it stands in the shared
-- pops.db (drizzle-migrations/0032_embeddings.sql). Column definitions
-- and indexes are copied verbatim so a fresh cerebrum.db matches the
-- shared shape byte-for-byte; the boot-time backfill ATTACHes pops.db
-- and copies rows across without column-rename gymnastics.
--
-- The companion `embeddings_vec` virtual table is NOT created via this
-- migration — it requires the sqlite-vec extension and is created
-- imperatively by `ensureEmbeddingsVecTable` after the extension loads
-- in `openCerebrumDb`. Drizzle's schema builder cannot express virtual
-- tables, and keeping the create-virtual-table call out of the
-- migration journal lets the embeddings baseline still succeed on
-- builds where sqlite-vec is unavailable (the metadata table is useful
-- on its own for sweeps and dedupe; vector search is the only feature
-- that needs the extension).

CREATE TABLE `embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`content_hash` text NOT NULL,
	`content_preview` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_embeddings_source_chunk` ON `embeddings` (`source_type`,`source_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `idx_embeddings_source_type` ON `embeddings` (`source_type`);--> statement-breakpoint
CREATE INDEX `idx_embeddings_content_hash` ON `embeddings` (`content_hash`);
