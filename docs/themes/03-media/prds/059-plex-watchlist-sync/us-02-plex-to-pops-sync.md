# US-02: Plex → POPS watchlist sync

> PRD: [059 — Plex Watchlist Sync](README.md)
> Status: Done

## Description

As a user, I want my Plex Universal Watchlist to sync into POPS so that movies and shows I add on any Plex client appear in my POPS watchlist automatically.

## Acceptance Criteria

- [x] `media.plex.syncWatchlist` tRPC mutation fetches all items from `https://discover.provider.plex.tv/library/sections/watchlist/all`
- [x] Each Plex watchlist item is matched to TMDB (movies) or TheTVDB (TV) by extracting IDs from the `Guid` array
- [x] Items not in the POPS library are added (same flow as PRD-039 US-03 library sync)
- [x] Items not on the POPS watchlist are added with `source="plex"` and `plexRatingKey` set
- [x] Items already on the POPS watchlist with `source="manual"` are updated to `source="both"`
- [x] Items removed from the Plex watchlist since last sync: removed from POPS only if `source="plex"` (not `"manual"` or `"both"`)
- [x] Items with `source="both"` that are removed from Plex: source updated to `"manual"` (not removed)
- [x] Sync returns `{ added: number, removed: number, skipped: number, errors: TvSyncError[] }`
- [x] Skipped items include title and reason (same pattern as PRD-039 US-03 skip reporting)
- [x] Sync is idempotent — repeated runs produce identical state
- [x] Scheduler (PRD-039 US-04) calls `syncWatchlist` after library + watch history sync
- [x] Tests cover: add from Plex, skip existing, source escalation manual→both, remove plex-sourced, preserve manual-sourced, idempotent repeated sync

## Notes

The Plex watchlist API is cloud-based (`discover.provider.plex.tv`), not the local server. Uses the same `X-Plex-Token` from PIN auth. RatingKey extracted from guid: `plex://movie/5d776...` → `5d776...`.
