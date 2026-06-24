# Epic 08: Library Rotation

> Theme: [Media](../README.md)

## Scope

Automated movie lifecycle management. The system continuously rotates the on-disk movie library: sourcing new candidates from configurable lists, adding movies daily, and removing stale ones after a "leaving soon" grace period. The library stays fresh within a target disk space budget without manual intervention.

Movies only. TV shows are out of scope.

"Done" = the system runs daily unattended, movies cycle in and out, the UI shows what's coming and going, and disk usage stays within the configured target.

## PRDs

| #   | PRD                                                  | Summary                                                                             | Status |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------ |
| 070 | [Rotation Engine](../prds/rotation-engine/README.md) | Daily cron, state machine, removal selection, addition execution, disk space gating | Done   |
| 071 | [Source Lists](../prds/source-lists/README.md)       | Source plugin system, candidate queue, exclusion list, weighted selection policy    | Done   |
| 072 | [Rotation UI](../prds/rotation-ui/README.md)         | "Leaving Soon" shelf, rotation settings, source management, queue/exclusion views   | Done   |

`rotation-engine` is the foundation — the engine that runs the daily cycle. `source-lists` provides the candidate pipeline that feeds it. `rotation-ui` is the UI layer over both. Build order: `rotation-engine` → `source-lists` (blocked by `rotation-engine`'s schema) → `rotation-ui` (can start once `rotation-engine`'s state machine exists, parallelisable with `source-lists` for the settings/leaving-soon parts).

## Dependencies

- **Requires:** Epic 07 (Radarr integration — add, delete, search, disk space endpoints), Epic 06 (Plex sync — watchlist, friends data), Epic 03 (watchlist — protection logic)
- **Unlocks:** Fully autonomous media library management. Future: TV show rotation, smart selection using comparison/rating data from Epic 04.

## Out of Scope

- TV show rotation (future epic)
- Smart pair selection using ELO/comparison data (future enhancement to selection policy)
- Multi-server Radarr support
- Torrent/download management (Radarr handles that)
