-- Cerebrum pillar baseline for the debrief slice (Theme-13 Wave 5 / MEDIA exit
-- prep). Mirrors the shared `pops.db` shape from the drizzle-migrations
-- ancestry: `0018_high_excalibur` (debrief_results + debrief_sessions) +
-- `0020_melodic_major_mapleleaf` (debrief_status) + `0071_debrief_media_denorm`
-- (media_type + media_id columns + the supporting index on debrief_sessions).
--
-- Cross-pillar reference: `watch_history_id` is a soft pointer into
-- `media.db.watch_history` once that table physically lives there. We do NOT
-- enforce the FK at the SQLite level — the cerebrum baseline drops it
-- intentionally so the two databases can be opened independently without
-- triggering FK violations. `comparison_dimensions` / `comparisons` live in
-- `media.db` too; same reasoning applies to those references. The original
-- shared-journal migrations expressed FKs because everything was on a single
-- `pops.db`; the moment cerebrum becomes its own SQLite file, those FKs
-- cannot cross databases.
--
-- `media_type` + `media_id` carry the denormalised media tuple from PR #3119
-- so the cross-pillar `getDebriefByMedia` read no longer has to inner-join
-- `watch_history`. They remain NULLable for the migration window — the
-- writer (`createDebriefSession`) sets them on insert, and the existing
-- shared rows are backfilled into cerebrum.db via the ATTACH bridge in
-- `apps/pops-api/src/db/backfill-cerebrum-from-shared.ts`.

CREATE TABLE `debrief_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_history_id` integer NOT NULL,
	`media_type` text,
	`media_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_debrief_sessions_media` ON `debrief_sessions` (`media_type`,`media_id`);--> statement-breakpoint
CREATE TABLE `debrief_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`comparison_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debrief_status` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_type` text NOT NULL,
	`media_id` integer NOT NULL,
	`dimension_id` integer NOT NULL,
	`debriefed` integer DEFAULT 0 NOT NULL,
	`dismissed` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `debrief_status_media_dimension_idx` ON `debrief_status` (`media_type`,`media_id`,`dimension_id`);
