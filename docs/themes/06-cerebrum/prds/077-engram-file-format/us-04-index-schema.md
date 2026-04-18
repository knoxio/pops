# US-04: Index Database Schema

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Done

## Description

As the Cerebrum system, I need SQLite tables for `engram_index`, `engram_scopes`, `engram_tags`, and `engram_links` defined as Drizzle schemas with appropriate indexes so that engram metadata is queryable without reading files from disk.

## Acceptance Criteria

- [x] A Drizzle schema defines `engram_index` with columns: `id` (text, PK), `file_path` (text, not null, unique), `type` (text, not null), `source` (text, not null), `status` (text, not null), `template` (text, nullable), `created_at` (text, not null), `modified_at` (text, not null), `title` (text, not null), `content_hash` (text, not null), `word_count` (integer, not null), `custom_fields` (text, nullable)
- [x] A Drizzle schema defines `engram_scopes` with columns: `engram_id` (text, FK to `engram_index.id`, not null), `scope` (text, not null), with a composite unique index on `(engram_id, scope)` and a standalone index on `scope`
- [x] A Drizzle schema defines `engram_tags` with columns: `engram_id` (text, FK to `engram_index.id`, not null), `tag` (text, not null), with a composite unique index on `(engram_id, tag)` and a standalone index on `tag`
- [x] A Drizzle schema defines `engram_links` with columns: `source_id` (text, FK to `engram_index.id`, not null), `target_id` (text, not null), with a composite unique index on `(source_id, target_id)` and a standalone index on `target_id`
- [x] Indexes exist on `engram_index` for columns: `type`, `source`, `status`, `created_at`, `content_hash`
- [x] A Drizzle migration is generated and applies cleanly to a fresh SQLite database
- [x] TypeScript types for all tables are exported from `@pops/db-types` (e.g., `EngramIndex`, `EngramScope`, `EngramTag`, `EngramLink`) using Drizzle's `$inferSelect` / `$inferInsert`
- [x] Foreign key cascades are set to `ON DELETE CASCADE` on all junction tables so that deleting an engram index row cleans up scopes, tags, and links

## Notes

- Follow existing Drizzle schema conventions in the POPS codebase for table/column naming and index patterns.
- The `custom_fields` column stores JSON as text — queries against individual custom fields will use `json_extract()` at the query layer, not at schema level.
- The `engram_links.target_id` intentionally does not have a foreign key constraint because the target engram may not yet be indexed (e.g., referenced in frontmatter but file not yet processed).
