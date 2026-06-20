# Epic 06: Plex Sync

> Theme: [Media](../README.md)

## Scope

Build polling-based sync with Plex Media Server. Import library items and watch history into POPS. Plex is one input source — POPS owns the library, Plex feeds into it.

## PRDs

| #   | PRD                                                              | Summary                                                                                                                               | Status |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 039 | [Plex Sync](../prds/039-plex-sync/README.md)                     | Plex API client, library scan, watch history import, Discover cloud sync, ID matching (TMDB/TheTVDB), polling schedule, settings page | Done   |
| 059 | [Plex Watchlist Sync](../prds/059-plex-watchlist-sync/README.md) | Bidirectional sync between POPS watchlist and Plex Universal Watchlist (cloud API), source tracking, conflict resolution              | Done   |

PRD-059 depends on PRD-039 (auth, settings page) and PRD-036 (watchlist).

## Dependencies

- **Requires:** Epic 03 (watch history and watchlist tables)
- **Unlocks:** Richer watch history data without manual entry; unified watchlist across POPS and all Plex clients

## Out of Scope

- Plex webhooks (requires Plex Pass — future enhancement)
- Continue watching / in-progress tracking
- Plex user rating import
