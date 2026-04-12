# US-01: Source Schema

> PRD: [Source Lists](README.md)

## Description

As a system, I need the database tables for rotation sources, candidates, and exclusions so that the candidate pipeline has persistent storage.

## Acceptance Criteria

- [ ] `rotation_sources` table exists with columns per PRD data model: `id`, `type`, `name`, `priority`, `enabled`, `config`, `last_synced_at`, `sync_interval_hours`, `created_at`
- [ ] `rotation_candidates` table exists with columns: `id`, `source_id`, `tmdb_id`, `title`, `year`, `rating`, `poster_path`, `status`, `discovered_at`
- [ ] `rotation_candidates` has a unique constraint on `tmdb_id`
- [ ] `rotation_exclusions` table exists with columns: `id`, `tmdb_id`, `title`, `reason`, `excluded_at`
- [ ] `rotation_exclusions` has a unique constraint on `tmdb_id`
- [ ] Foreign key: `rotation_candidates.source_id` → `rotation_sources.id` with cascade delete
- [ ] A system `manual` source is seeded on first server boot (type = `'manual'`, name = `'Manual Queue'`, priority = 8)
- [ ] Drizzle schema types are exported from `@pops/db-types`

## Notes

Follow existing Drizzle schema patterns in `packages/db-types/src/schema/`. The `config` column on `rotation_sources` stores JSON — use text with application-level parsing (consistent with how settings work elsewhere).
