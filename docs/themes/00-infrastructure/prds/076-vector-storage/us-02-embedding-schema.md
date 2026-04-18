# US-02: Embedding Schema

> PRD: [Vector Storage](README.md)
> Status: Done

## Description

As a backend developer, I define the embedding storage schema via Drizzle so that vectors and their metadata are managed by the same migration system as all other tables.

## Acceptance Criteria

- [x] `embeddings` table defined in `packages/db-types/src/schema/core/embeddings.ts`
- [x] Table includes: id, source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at
- [x] Unique index on `(source_type, source_id, chunk_index)`
- [x] Index on `source_type` and `content_hash`
- [x] sqlite-vec virtual table `embeddings_vec` created via raw SQL in Drizzle migration `0033_embeddings_vec.sql`
- [x] `embeddings_vec.rowid` matches `embeddings.id` — enforced by application code, not FK constraint (virtual tables don't support FKs)
- [x] Migration SQL written by hand (drizzle-kit generate not available in CI) — two migrations: `0032_embeddings.sql` + `0033_embeddings_vec.sql`
- [x] Migration applies to an existing database with data without errors
- [x] Types exported from `@pops/db-types` for use in services

## Notes

sqlite-vec virtual tables use a special `CREATE VIRTUAL TABLE ... USING vec0(...)` syntax. This must be a raw SQL statement in the migration file, with a comment explaining why it's not a Drizzle schema definition. The metadata table (`embeddings`) is a normal Drizzle table.
