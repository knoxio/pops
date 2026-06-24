# Epic 03: Tracking & Watchlist

> Theme: [Media](../README.md)

## Scope

Build watch history tracking and watchlist management. Track what's been watched (at episode level for TV), maintain a prioritised watchlist of what to watch next, with auto-removal when watched.

## PRDs

| #   | PRD                                              | Summary                                                                                                          | Status |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------ |
| 035 | [Watch History](../prds/watch-history/README.md) | Episode/movie watch tracking, chronological history page, mark-as-watched actions, undo toast                    | Done   |
| 036 | [Watchlist](../prds/watchlist/README.md)         | Add/remove from watchlist, priority ordering, filters, auto-remove on watch (manual watches only, not Plex sync) | Done   |

`watch-history` and `watchlist` can be built in parallel. `watchlist`'s auto-remove depends on `watch-history`'s watch tracking.

## Dependencies

- **Requires:** Epic 02 (detail pages where watch/watchlist actions live)
- **Unlocks:** Epic 04 (comparisons only between watched movies), Epic 05 (recommendations use watch history)

## Out of Scope

- Plex watch history sync (Epic 06)
- In-progress / "continue watching" tracking (future enhancement)
