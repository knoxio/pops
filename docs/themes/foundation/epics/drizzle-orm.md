# Epic: Drizzle ORM

> Theme: [Foundation](../README.md)

## Scope

Adopt Drizzle ORM for type-safe database access and schema-as-code in every TypeScript pillar. Define all table schemas in TypeScript, replace raw SQL queries with typed Drizzle queries, and set up migration generation via `drizzle-kit`.

## PRDs

| PRD                                                               | Summary                                                               | Status |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| [Drizzle ORM](../../01-foundation/prds/011-drizzle-orm/README.md) | Schema files, type-safe queries, migration generation, type inference | Done   |

## Dependencies

- **Requires:** [DB Schema Patterns](db-schema-patterns.md) (schema patterns must be established)
- **Unlocks:** Cleaner schema evolution for all future pillar work

## Out of Scope

- Changing the database engine (stays SQLite + better-sqlite3)
- Async queries (better-sqlite3 synchronous mode preserved)
- New domain schemas (those come from their respective themes)
