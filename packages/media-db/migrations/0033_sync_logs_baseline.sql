-- Media pillar baseline for the sync_logs ledger (Theme-13 Wave-5 cascade
-- per PR #3191's MEDIA exit audit, alongside the comparisons cluster in
-- `0032_comparisons_baseline.sql`). Mirrors the shared `pops.db` shape from
-- the drizzle-migrations ancestry: `0009_red_quasimodo`.
--
-- Although the shared journal entry is owned by `core` (the file also
-- rebuilt `home_inventory` and seeded several non-media indexes), the
-- `sync_logs` table itself is a media-pillar ledger of Plex → media-db
-- sync runs (movie/tv counts, error payloads, durations) — it has no
-- non-media reader. The 5 consumers all live in
-- `apps/pops-api/src/modules/media/plex/scheduler-sync-logs.ts`.
--
-- Existing rows are backfilled into media.db via the ATTACH bridge in
-- `apps/pops-api/src/db/backfill-media-from-shared.ts`.

CREATE TABLE `sync_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`synced_at` text NOT NULL,
	`movies_synced` integer DEFAULT 0 NOT NULL,
	`tv_shows_synced` integer DEFAULT 0 NOT NULL,
	`errors` text,
	`duration_ms` integer
);
