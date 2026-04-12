# Epic 08: Library Rotation

> Theme: [Media](../README.md)

## Scope

Automated movie lifecycle management. The system continuously rotates the on-disk movie library: sourcing new candidates from configurable lists, adding movies daily, and removing stale ones after a "leaving soon" grace period. The library stays fresh within a target disk space budget without manual intervention.

Movies only. TV shows are out of scope.

"Done" = the system runs daily unattended, movies cycle in and out, the UI shows what's coming and going, and disk usage stays within the configured target.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 070 | [Rotation Engine](../prds/070-rotation-engine/README.md) | Daily cron, state machine, removal selection, addition execution, disk space gating | Not started |
| 071 | [Source Lists](../prds/071-source-lists/README.md) | Source plugin system, candidate queue, exclusion list, weighted selection policy | Not started |
| 072 | [Rotation UI](../prds/072-rotation-ui/README.md) | "Leaving Soon" shelf, rotation settings, source management, queue/exclusion views | Not started |

PRD-070 is the foundation — the engine that runs the daily cycle. PRD-071 provides the candidate pipeline that feeds it. PRD-072 is the UI layer over both. Build order: 070 → 071 (blocked by 070's schema) → 072 (can start once 070's state machine exists, parallelisable with 071 for the settings/leaving-soon parts).

## Dependencies

- **Requires:** Epic 07 (Radarr integration — add, delete, search, disk space endpoints), Epic 06 (Plex sync — watchlist, friends data), Epic 03 (watchlist — protection logic)
- **Unlocks:** Fully autonomous media library management. Future: TV show rotation, smart selection using comparison/rating data from Epic 04.

## Out of Scope

- TV show rotation (future epic)
- Smart pair selection using ELO/comparison data (future enhancement to selection policy)
- Multi-server Radarr support
- Torrent/download management (Radarr handles that)
