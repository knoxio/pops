-- Media pillar baseline for the media_scores slice (Theme-13 Wave-5 cascade
-- per PR #3191's MEDIA exit audit). Mirrors the shared `pops.db` shape from
-- the drizzle-migrations ancestry: `0002_magical_kid_colt` (media_scores
-- baseline) + `0015_condemned_anthem` (excluded column).
--
-- Cross-pillar reference: `dimension_id` is a soft pointer into
-- `pops.db.comparison_dimensions`. We do NOT enforce the FK at the SQLite
-- level — the comparisons cluster (`comparisons`, `comparison_dimensions`)
-- stays on the shared `pops.db` for now and SQLite FKs cannot cross
-- ATTACH-ed databases. Once the comparisons cluster migrates into media-db
-- a follow-up baseline can promote the soft pointer back to a hard FK.
--
-- The existing rows are backfilled into media.db via the ATTACH bridge in
-- `apps/pops-api/src/db/backfill-media-from-shared.ts`.

CREATE TABLE `media_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`score` real DEFAULT 1500 NOT NULL,
	`comparison_count` integer DEFAULT 0 NOT NULL,
	`excluded` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_scores_unique` ON `media_scores` (`media_type`,`media_id`,`dimension_id`);--> statement-breakpoint
CREATE INDEX `idx_media_scores_dimension` ON `media_scores` (`dimension_id`);
