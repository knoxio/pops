# Epic: DB Schema Patterns

**Theme:** Foundation
**Priority:** 4 (can run in parallel with epic 3)
**Status:** Not started

## Goal

Establish conventions for database schema management that scale across multiple domains. Ensure new apps can add tables and migrations without conflicting with existing ones.

## Scope

### In scope

- Document migration conventions: naming, ordering, rollback strategy
- Establish entity type system (entities gain a `type` or `tags` column)
- Define cross-domain foreign key patterns (e.g., inventory item → finance transaction)
- Create a schema registry or manifest listing all tables and their owning domain
- Review and document existing schema for consistency
- Add migration tooling if current approach doesn't scale (evaluate current `schema_migrations` table)

### Out of scope

- Creating schemas for new domains (media, fitness, etc.) — that happens in their PRDs
- Changing the database engine
- Multi-database setup

## Deliverables

1. Migration conventions documented
2. Entity table updated with type/tag system
3. Cross-domain FK pattern documented with at least one example (inventory → finance already exists)
4. Schema registry document listing all tables and owners
5. Existing migrations cleaned up if needed

## Key Decisions

- **Entity types**: enum column vs tags table vs both? Needs to support: company, person, service, place, brand, and future types.
- **Migration numbering**: timestamp-based vs sequential? Timestamp avoids conflicts when multiple people/agents work in parallel.
- **FK constraints**: strict (CASCADE/RESTRICT) vs soft (nullable, app-level validation)? Soft FKs are simpler for optional cross-domain links.

## Dependencies

- Epic 3 (API Modularisation) — entity promotion to `core/` should happen first so the schema changes align with the API structure
