# Epic 01: Metadata Integration

> Theme: [Media](../README.md)

## Scope

Build the service layer for fetching metadata from external APIs. TMDB for movies, TheTVDB for TV shows (per ADR-009). Each client handles search, metadata fetch, poster download/cache (per ADR-011), and rate limiting.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 029 | [TMDB Client](../prds/029-tmdb-client/README.md) | HTTP client, token bucket rate limiter, search, metadata fetch, image download/cache, add-to-library flow | Partial |
| 030 | [TheTVDB Client](../prds/030-thetvdb-client/README.md) | Auth flow (JWT), rate limiting, search, seasons/episodes fetch, image download/cache | Partial |

PRD-029 and PRD-030 can be built in parallel — independent APIs, independent clients.

## Dependencies

- **Requires:** Epic 00 (tables must exist to store metadata)
- **Unlocks:** Epic 02 (UI needs metadata to display)

## Out of Scope

- UI for browsing/searching (Epic 02)
- Plex metadata matching (Epic 06)
