-- Media pillar baseline for the rotation slice (Theme-13 Wave-5 cascade
-- per PR #3191's MEDIA exit audit). Mirrors the shared `pops.db` shape from
-- the drizzle-migrations ancestry: `0028_needy_terror` (rotation_log) +
-- `0029_curved_revanche` (rotation_sources + rotation_candidates +
-- rotation_exclusions).
--
-- The `rotation_*` cluster is internally self-contained — `rotation_candidates`
-- references `rotation_sources(id)`, and those are both inside this pillar, so
-- the FK is preserved (intra-pillar FKs are fine; only cross-SQLite-file FKs
-- were dropped in the cerebrum debrief baseline).
--
-- The `movies.rotation_status` / `rotation_expires_at` / `rotation_marked_at`
-- columns ride in `0022_media_movies_baseline.sql` already. They're not
-- re-declared here.
--
-- Existing rows are backfilled into media.db via the ATTACH bridge in
-- `apps/pops-api/src/db/backfill-media-from-shared.ts`.

CREATE TABLE `rotation_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`executed_at` text NOT NULL,
	`movies_marked_leaving` integer NOT NULL,
	`movies_removed` integer NOT NULL,
	`movies_added` integer NOT NULL,
	`removals_failed` integer NOT NULL,
	`free_space_gb` real NOT NULL,
	`target_free_gb` real NOT NULL,
	`skipped_reason` text,
	`details` text
);
--> statement-breakpoint
CREATE TABLE `rotation_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`config` text,
	`last_synced_at` text,
	`sync_interval_hours` integer DEFAULT 24 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rotation_sources_type` ON `rotation_sources` (`type`);--> statement-breakpoint
CREATE TABLE `rotation_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`rating` real,
	`poster_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`discovered_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `rotation_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rotation_candidates_tmdb_id` ON `rotation_candidates` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_rotation_candidates_source_id` ON `rotation_candidates` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_rotation_candidates_status` ON `rotation_candidates` (`status`);--> statement-breakpoint
CREATE TABLE `rotation_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`reason` text,
	`excluded_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rotation_exclusions_tmdb_id` ON `rotation_exclusions` (`tmdb_id`);
