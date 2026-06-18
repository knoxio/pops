# Epic 07: Radarr & Sonarr

> Theme: [Media](../README.md)

## Scope

Integrate with Radarr (movies) and Sonarr (TV) for status display and request management. Starts with read-only status badges, evolves toward full request management — replacing Overseerr as the single interface for requesting and managing media.

## PRDs

| #   | PRD                                                                          | Summary                                                                                                                                                    | Status |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 040 | [Arr Status Display](../prds/040-arr-status-display/README.md)               | Read-only status badges on detail pages (monitored, downloading, available), download queue display. Shared base client pattern for both Radarr and Sonarr | Done   |
| 041 | [Radarr Request Management](../prds/041-radarr-request-management/README.md) | Request movies from within POPS, quality profile selection, search triggers, monitoring management                                                         | Done   |
| 042 | [Sonarr Request Management](../prds/042-sonarr-request-management/README.md) | Series management, season/episode monitoring, calendar view, quality profiles, future vs past season handling                                              | Done   |

PRD-040 is prerequisite (base client). PRD-041 and PRD-042 can be built in parallel after that.

## Dependencies

- **Requires:** Epic 02 (detail pages where status badges and request actions live)
- **Unlocks:** Recommendations → requests in one flow (Epic 05 surfaces suggestions, this epic lets you act on them)

## Out of Scope

- Direct torrent/download management (Radarr/Sonarr handle that)
- Quality profile creation (manage in Radarr/Sonarr directly)
- Arr system configuration or settings management
