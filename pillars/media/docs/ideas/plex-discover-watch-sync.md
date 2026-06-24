# Idea: Plex Discover cloud watch-state sync

Status: not built. The contract's sync-job enum (`rest-plex-sync.ts`) deliberately
excludes `plexSyncDiscoverWatches`, and `run-sync-job.ts` has no branch for it.
`api/clients/plex/discover.ts` exists but is only a _trending_ client for the
discovery rotation source — it does not read per-item `userState`.

## What to build

A backfill that checks every POPS library item against the Plex Discover cloud
API (`metadata.provider.plex.tv`), catching watches from streaming services
(Netflix, Disney+, …) and other Plex servers — not just the local library.

- New job type `plexSyncDiscoverWatches` added to `SYNC_JOB_TYPE_ENUM` and a
  matching branch in `runSyncJob`.
- One-time backfill: search Discover by title, match by TMDB/TVDB id, read
  `userState`; when watched, log a `source='plex_sync'` watch event (reusing the
  existing dedupe + watchlist-skip path).
- Auto-check on add: when a movie is added to the library, check Plex Discover
  for its watch state inline — no ongoing cron needed, the per-item check covers
  future additions.

## Acceptance

- `POST /plex/sync` with `plexSyncDiscoverWatches` runs the backfill and reports
  items checked / watches logged / no-match.
- Adding a movie already watched on a streaming service surfaces it in POPS watch
  history with `source='plex_sync'` without a manual sync.
- Re-running is idempotent (same `(media_type, media_id, watched_at)` dedupe).
