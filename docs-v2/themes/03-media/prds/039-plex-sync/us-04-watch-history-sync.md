# US-04: Watch history sync

> PRD: [039 — Plex Sync](README.md)
> Status: To Review

## Description

As a user, I want my Plex watch history synced into POPS so that movies and episodes I've watched on Plex appear in my watch history without manual logging.

## Acceptance Criteria

- [ ] During movie sync, if Plex marks a movie as watched, a watch event is logged via `watchHistory.log` with `source="plex_sync"`
- [ ] During TV show sync, if Plex marks an episode as watched, a watch event is logged for that episode with `source="plex_sync"`
- [ ] `watchedAt` is set to the Plex "last viewed at" timestamp (not the sync time)
- [ ] Watch events with `source="plex_sync"` do NOT trigger watchlist auto-removal
- [ ] The existing `watchHistory.log` procedure distinguishes manual watches (auto-remove from watchlist) from plex_sync watches (skip removal) based on the source field
- [ ] Unique constraint on (mediaType, mediaId, watchedAt) prevents duplicate watch entries across repeated syncs
- [ ] If a watch event already exists for the same item and timestamp, it is silently skipped (not an error)
- [ ] Scheduler: `startScheduler(intervalHours)` begins periodic sync at the configured interval
- [ ] Scheduler: `stopScheduler()` cancels the periodic timer
- [ ] Scheduler: `getSchedulerStatus()` returns `{ running, intervalHours, nextRunAt, lastRunAt }`
- [ ] Scheduler state persists in the settings table — if the server restarts, an enabled scheduler resumes on boot
- [ ] Each scheduled sync run logs results (synced/skipped/errors) and stores them for display on the settings page
- [ ] Tests cover: watch event created with source="plex_sync", watchlist auto-removal skipped for plex_sync, duplicate watch event silently skipped, scheduler starts/stops, scheduler persists across restarts, scheduler runs at interval

## Notes

The `source` field on watch_history entries is the mechanism that controls auto-removal behaviour. The `watchHistory.log` procedure should check `source` and skip the watchlist removal step when `source="plex_sync"`. The scheduler uses `setInterval` (or equivalent) on the server — it does not depend on external cron. On server boot, the startup sequence should check if the scheduler was previously enabled and restart it.
