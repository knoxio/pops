# Epic 06: Drizzle ORM

> Theme: [Foundation](../README.md)

## Scope

Adopt Drizzle ORM for type-safe database access and schema-as-code. Define all table schemas in TypeScript, replace raw SQL queries with typed Drizzle queries, and set up migration generation via `drizzle-kit`.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 011 | [Drizzle ORM](../prds/011-drizzle-orm/README.md) | Schema files, type-safe queries, migration generation, type inference | Partial |

## Dependencies

- **Requires:** Epic 04 (schema patterns must be established)
- **Unlocks:** Cleaner schema evolution for all future domain work

## Out of Scope

- Changing the database engine (stays SQLite + better-sqlite3)
- Async queries (better-sqlite3 synchronous mode preserved)
- New domain schemas (those come from their respective themes)
