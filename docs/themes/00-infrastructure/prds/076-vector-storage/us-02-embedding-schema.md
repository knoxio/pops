# US-02: Embedding Schema

> PRD: [Vector Storage](README.md)
> Status: Not started

## Description

As a backend developer, I define the embedding storage schema via Drizzle so that vectors and their metadata are managed by the same migration system as all other tables.

## Acceptance Criteria

- [ ] `embeddings` table defined in `packages/db-types/src/schema/core/embeddings.ts`
- [ ] Table includes: id, source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at
- [ ] Unique index on `(source_type, source_id, chunk_index)`
- [ ] Index on `source_type` and `content_hash`
- [ ] sqlite-vec virtual table `embeddings_vec` created via raw SQL in a Drizzle migration (virtual tables aren't supported by Drizzle's schema builder)
- [ ] `embeddings_vec.rowid` matches `embeddings.id` — enforced by application code, not FK constraint (virtual tables don't support FKs)
- [ ] `drizzle-kit generate` produces a clean migration
- [ ] Migration applies to an existing database with data without errors
- [ ] Types exported from `@pops/db-types` for use in services

## Notes

sqlite-vec virtual tables use a special `CREATE VIRTUAL TABLE ... USING vec0(...)` syntax. This must be a raw SQL statement in the migration file, with a comment explaining why it's not a Drizzle schema definition. The metadata table (`embeddings`) is a normal Drizzle table.
