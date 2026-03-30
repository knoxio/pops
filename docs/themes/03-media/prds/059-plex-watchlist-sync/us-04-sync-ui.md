# US-04: Watchlist sync UI

> PRD: [059 — Plex Watchlist Sync](README.md)
> Status: Not started

## Description

As a user, I want to see watchlist sync status on the Plex settings page and trigger a manual sync so that I can verify the integration is working.

## Acceptance Criteria

- [ ] Plex settings page shows a "Watchlist Sync" section (below library sync)
- [ ] Section displays: last sync timestamp, items added, items removed from last run
- [ ] "Sync Watchlist" button triggers `media.plex.syncWatchlist` manually
- [ ] Button shows loading state during sync
- [ ] Results update after sync completes (added/removed/skipped/errors)
- [ ] Errors expandable (same pattern as library sync skip/error details)
- [ ] Section hidden when Plex is not connected
- [ ] Tests cover: section visibility based on connection state, manual sync trigger, results display

## Notes

Follows the same UI patterns as the library sync section on the Plex settings page. Watchlist sync runs last in the scheduler sequence (after movies → TV shows → watch history → watchlist).
