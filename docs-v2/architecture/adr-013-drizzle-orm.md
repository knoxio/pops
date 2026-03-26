# ADR-013: Drizzle ORM for Database Access

## Status

Accepted (not yet implemented)

## Context

POPS uses SQLite with better-sqlite3 for all database access. With 11 planned domains and 40+ tables, the database layer needs type-safe queries, schema-as-code, and automated migration generation. Raw SQL with manual type casting doesn't scale — column renames or additions can silently drift from TypeScript types.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Raw SQL + better-sqlite3 | Full SQL control, zero dependencies, works today | No compile-time type safety, manual type casting, hand-written migrations, boilerplate grows linearly |
| Drizzle ORM | Type-safe queries, schema-as-code (schema IS the type), auto-generated migrations, SQL-like syntax, lightweight, first-class SQLite support | New dependency, learning curve |
| Kysely | Close to raw SQL, excellent TypeScript inference | No schema management — still need hand-written migrations |
| Prisma | Mature, well-documented | Heavy runtime (query engine binary), own schema language, poor SQLite support, overkill |

## Decision

Drizzle ORM. It hits the sweet spot: type-safe queries and schema management without the weight of a full ORM.

Key wins:
- **Schema is the type** — define tables in TypeScript, query builder knows every column at compile time. No separate type definitions to keep in sync
- **SQL-like, not SQL-hiding** — queries read like SQL, no magic methods or hidden joins
- **Migration generation** — `drizzle-kit generate` diffs schema vs database, produces reviewable SQL
- **Same driver** — uses better-sqlite3 under the hood, synchronous API preserved

## Consequences

- All new domain modules use Drizzle from day one
- Existing modules migrate incrementally (one at a time)
- Separate row type definitions (`@pops/db-types` zod schemas) replaced by Drizzle inferred types
- Migrations are auto-generated but still reviewable SQL
- Zod schemas remain for input validation (user input, not database rows)
- Synchronous better-sqlite3 behaviour preserved
