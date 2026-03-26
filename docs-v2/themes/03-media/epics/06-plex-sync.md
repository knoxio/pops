# Epic 06: Plex Sync

> Theme: [Media](../README.md)

## Scope

Build polling-based sync with Plex Media Server. Import library items and watch history into POPS. Plex is one input source — POPS owns the library, Plex feeds into it.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 039 | [Plex Sync](../prds/039-plex-sync/README.md) | Plex API client, library scan, watch history import, ID matching (TMDB for movies, TheTVDB for TV), polling schedule, settings page | Done |

## Dependencies

- **Requires:** Epic 03 (watch history tables to write into)
- **Unlocks:** Richer watch history data without manual entry

## Out of Scope

- Plex webhooks (requires Plex Pass — future enhancement)
- Continue watching / in-progress tracking
- Plex user rating import
- Bidirectional watchlist sync with Plex Discover
