-- Add body_hash column to engram_index for body-only dedup in ingestion pipeline.
-- content_hash = sha256(full serialised file); body_hash = sha256(normalised body only).
-- Nullable so existing rows don't need back-filling before next reindex.

ALTER TABLE `engram_index` ADD COLUMN `body_hash` text;
--> statement-breakpoint
CREATE INDEX `idx_engram_index_body_hash` ON `engram_index` (`body_hash`);
