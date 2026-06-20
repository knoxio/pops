# US-04: Watch history sync

> PRD: [039 — Plex Sync](README.md)
> Status: Done

## Description

As a user, I want my Plex watch history synced into POPS so that movies and episodes I've watched on Plex appear in my watch history without manual logging.

## Acceptance Criteria

- [x] During movie sync, if Plex marks a movie as watched, a watch event is logged via `watchHistory.log` with `source="plex_sync"`
- [x] During TV show sync, if Plex marks an episode as watched, a watch event is logged for that episode with `source="plex_sync"`
- [x] `watchedAt` is set to the Plex "last viewed at" timestamp (not the sync time)
- [x] Watch events with `source="plex_sync"` do NOT trigger watchlist auto-removal
- [x] The existing `watchHistory.log` procedure distinguishes manual watches (auto-remove from watchlist) from plex_sync watches (skip removal) based on the source field
- [x] Unique constraint on (mediaType, mediaId, watchedAt) prevents duplicate watch entries across repeated syncs
- [x] If a watch event already exists for the same item and timestamp, it is silently skipped (not an error)
- [x] Scheduler: `startScheduler(intervalHours)` begins periodic sync at the configured interval
- [x] Scheduler: `stopScheduler()` cancels the periodic timer
- [x] Scheduler: `getSchedulerStatus()` returns `{ running, intervalHours, nextRunAt, lastRunAt }`
- [x] Scheduler state persists in the settings table — if the server restarts, an enabled scheduler resumes on boot
- [x] Each scheduled sync run logs results (synced/skipped/errors) and stores them for display on the settings page
- [x] Tests cover: watch event created with source="plex_sync", watchlist auto-removal skipped for plex_sync, duplicate watch event silently skipped, scheduler starts/stops, scheduler persists across restarts, scheduler runs at interval

## Notes

The `source` field on watch_history entries is the mechanism that controls auto-removal behaviour. The `watchHistory.log` procedure checks `source` and skips the watchlist removal step when `source="plex_sync"`. The scheduler uses `setInterval` on the server. On server boot, the startup sequence checks if the scheduler was previously enabled and restarts it automatically.
