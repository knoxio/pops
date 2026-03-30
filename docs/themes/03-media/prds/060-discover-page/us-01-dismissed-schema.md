# US-01: Dismissed movies schema and endpoints

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a developer, I want a persistent store for dismissed ("Not Interested") movies so that all discover sections can exclude them.

## Acceptance Criteria

- [ ] New `dismissed_discover` SQLite table: `tmdb_id INTEGER PRIMARY KEY, dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))`
- [ ] Drizzle schema in `packages/db-types/src/schema/dismissed-discover.ts`, exported from `schema/index.ts` and `index.ts`
- [ ] Drizzle migration generated via `drizzle-kit generate`
- [ ] `initializeSchema` in `schema.ts` includes the CREATE TABLE
- [ ] `media.discovery.dismiss` tRPC mutation: inserts tmdbId, idempotent via ON CONFLICT DO NOTHING
- [ ] `media.discovery.undismiss` tRPC mutation: deletes by tmdbId
- [ ] `media.discovery.getDismissed` tRPC query: returns `number[]` of all dismissed tmdbIds
- [ ] Tests cover: dismiss idempotency, undismiss removes, getDismissed returns correct set
