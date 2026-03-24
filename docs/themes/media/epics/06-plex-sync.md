# Epic: Plex Sync

**Theme:** Media
**Priority:** 6
**Status:** In Progress

## Goal

Sync the Plex library, watch history, and watchlist with POPS so that watched status is tracked automatically and watchlists stay in sync across both systems. Authentication and server configuration must be handled through a user-friendly, dynamic setup process within the application.

## Scope

### In scope

- **Dynamic Authentication Flow:**
  - Implement Plex PIN-based authentication (OAuth-like).
  - Store authentication tokens securely in the database `settings` table.
  - Automate the sign-in redirect and polling process.
- **UI-Driven Configuration:**
  - Provide a settings interface for entering and validating the Plex Server URL.
  - Classify server address and user tokens as **Settings** (DB), not **Secrets** (ENV).
- **Library & History Sync:**
  - Discover and select Plex libraries via the UI.
  - Initial import of movie and TV show metadata.
  - Continuous sync of watch history at the episode level.
  - Idempotent sync — repeated runs must not create duplicate watch history entries.
- **Bidirectional Watchlist Sync:**
  - Plex → POPS: items on the Plex Universal Watchlist are added to the POPS watchlist during periodic sync.
  - POPS → Plex: items added/removed in POPS are pushed to the Plex watchlist inline (at mutation time).
  - Source tracking and conflict resolution for items managed in both systems.
- **Robust Connection Management:**
  - Real-time connection health monitoring.
  - Explicit error reporting for unreachable servers or expired tokens.

### Out of scope

- Webhooks (v1 uses polling only).
- Non-video content (music, photos).
- Multi-user support.

## Deliverables

1. **Plex PIN Authentication Service:** Dynamic token acquisition and database persistence.
2. **Server Configuration UI:** Integrated URL entry with mandatory reachability validation.
3. **Plex API Client:** Dynamic client factory that retrieves credentials from database. Includes both local server API and Plex cloud API (`discover.provider.plex.tv`) for watchlist operations.
4. **Metadata Matching Logic:** Extraction of TMDB/TheTVDB IDs from Plex library data.
5. **Initial Sync Engine:** Background importer for libraries and watch history. Idempotent — safe to run repeatedly.
6. **Polling Scheduler:** Periodic synchronization of new activity (watch history + watchlist).
7. **Bidirectional Watchlist Sync:** Plex ↔ POPS watchlist synchronisation with source tracking and conflict resolution.
8. **Sync Status Dashboard:** Visual feedback on connection health and sync results (library, watch history, watchlist).

## Dependencies

- [Epic 04: DB Schema Patterns](../../foundation/epics/04-db-schema-patterns.md) — Shared `settings` table.
- [Epic 01: Metadata Integration](../01-metadata-integration.md) — TMDB/TheTVDB clients.

## Risks

- **Authentication Timeout:** User might not complete the Plex sign-in within the PIN window. *Mitigation:* Clear instructions and easy "Retry" button.
- **Address Changes:** Home servers often have dynamic IPs. *Mitigation:* Explicit "Missing URL" status and easy UI-based updates.
- **Plex Cloud API instability:** The watchlist API is hosted on `discover.provider.plex.tv` (cloud), not the local server. Plex has migrated this domain before (`metadata.provider.plex.tv` → `discover.provider.plex.tv`). *Mitigation:* POPS → Plex push failures are non-blocking; the local operation always succeeds. Reconciliation happens on next Plex → POPS poll.
- **Watchlist conflict loops:** Rapid add/remove from both sides could cause oscillation. *Mitigation:* Source tracking (`manual`, `plex`, `both`) and last-writer-wins within a sync cycle.
