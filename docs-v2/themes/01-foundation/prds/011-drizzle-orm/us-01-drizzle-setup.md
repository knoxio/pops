# US-01: Set up Drizzle ORM

> PRD: [011 — Drizzle ORM](README.md)
> Status: To Review

## Description

As a developer, I want Drizzle ORM installed and configured so that schema files can define tables and queries can use the typed query builder.

## Acceptance Criteria

- [ ] `drizzle-orm` installed as dependency in `pops-api`
- [ ] `drizzle-kit` installed as dev dependency
- [ ] `drizzle.config.ts` configured for SQLite + better-sqlite3
- [ ] Database connection wrapper exports a typed Drizzle instance
- [ ] Synchronous mode preserved (better-sqlite3 sync adapter)
- [ ] Existing database connection still works — no breaking changes

## Notes

Drizzle wraps better-sqlite3 — same driver, same sync behaviour, same single-file database. This is adding a type layer, not changing the engine.
