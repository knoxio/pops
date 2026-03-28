# Epic 03: Tracking & Watchlist

> Theme: [Media](../README.md)

## Scope

Build watch history tracking and watchlist management. Track what's been watched (at episode level for TV), maintain a prioritised watchlist of what to watch next, with auto-removal when watched.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 035 | [Watch History](../prds/035-watch-history/README.md) | Episode/movie watch tracking, chronological history page, mark-as-watched actions, undo toast | Partial |
| 036 | [Watchlist](../prds/036-watchlist/README.md) | Add/remove from watchlist, priority ordering, filters, auto-remove on watch (manual watches only, not Plex sync) | Partial |

PRD-035 and PRD-036 can be built in parallel. PRD-036's auto-remove depends on PRD-035's watch tracking.

## Dependencies

- **Requires:** Epic 02 (detail pages where watch/watchlist actions live)
- **Unlocks:** Epic 04 (comparisons only between watched movies), Epic 05 (recommendations use watch history)

## Out of Scope

- Plex watch history sync (Epic 06)
- In-progress / "continue watching" tracking (future enhancement)
