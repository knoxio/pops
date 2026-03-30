# US-01: Dismissed movies schema and endpoints

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a developer, I want a persistent store for dismissed ("Not Interested") movies so that all discover sections can exclude them.

## Acceptance Criteria

- [x] New `dismissed_discover` SQLite table: `tmdb_id INTEGER PRIMARY KEY, dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))`
- [x] Drizzle schema in `packages/db-types/src/schema/dismissed-discover.ts`, exported from `schema/index.ts` and `index.ts`
- [x] Drizzle migration generated via `drizzle-kit generate`
- [x] `initializeSchema` in `schema.ts` includes the CREATE TABLE
- [x] `media.discovery.dismiss` tRPC mutation: inserts tmdbId, idempotent via ON CONFLICT DO NOTHING
- [x] `media.discovery.undismiss` tRPC mutation: deletes by tmdbId
- [x] `media.discovery.getDismissed` tRPC query: returns `number[]` of all dismissed tmdbIds
- [x] Tests cover: dismiss idempotency, undismiss removes, getDismissed returns correct set
