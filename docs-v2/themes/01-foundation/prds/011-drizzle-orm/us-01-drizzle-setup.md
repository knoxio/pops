# US-01: Set up Drizzle ORM

> PRD: [011 — Drizzle ORM](README.md)
> Status: Done

## Description

As a developer, I want Drizzle ORM installed and configured so that schema files can define tables and queries can use the typed query builder.

## Acceptance Criteria

- [x] `drizzle-orm` installed as dependency in `pops-api`
- [x] `drizzle-kit` installed as dev dependency
- [x] `drizzle.config.ts` configured for SQLite + better-sqlite3
- [x] Database connection wrapper exports a typed Drizzle instance
- [x] Synchronous mode preserved (better-sqlite3 sync adapter)
- [x] Existing database connection still works — no breaking changes

## Notes

Drizzle wraps better-sqlite3 — same driver, same sync behaviour, same single-file database. This is adding a type layer, not changing the engine.
