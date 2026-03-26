# US-05: Migrate media and inventory modules to Drizzle

> PRD: [011 — Drizzle ORM](README.md)
> Status: Done

## Description

As a developer, I want the media and inventory modules using Drizzle queries so that all modules use the same database access pattern.

## Acceptance Criteria

- [x] All raw SQL in media services replaced with Drizzle
- [x] All raw SQL in inventory services replaced with Drizzle
- [x] No `as Row[]` type casts remain in any module
- [x] All media tests pass (comparisons, watch history, plex sync)
- [x] All inventory tests pass (items, locations, connections, documents)
- [x] Complex queries: connection chain tracing (recursive CTE), comparison scoring, media search — all produce correct results

## Notes

Media has polymorphic queries (`media_type + media_id` patterns) and recursive CTEs (connection tracing). These may need Drizzle's `sql` template literal escape hatch. Use it sparingly and document where raw SQL is needed.
