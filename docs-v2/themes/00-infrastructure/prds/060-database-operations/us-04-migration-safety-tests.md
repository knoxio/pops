# US-04: Migration data safety tests

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As a developer, I want CI tests that verify migrations don't lose data so that a schema change can never silently drop rows or columns.

## Acceptance Criteria

- [x] Test file: `apps/pops-api/src/db/migration-safety.test.ts`
- [x] Test creates an in-memory SQLite database with the full schema (via `initializeSchema`)
- [x] Test inserts representative seed data into key tables: transactions (with tags JSON, entity FK), movies (with genres JSON), items (with location FK, connections), watchlist, watch_history
- [x] Test applies all Drizzle migrations via `drizzle-kit migrate` (or programmatic equivalent)
- [x] After migration, test queries each seeded table and verifies: row count unchanged, column values intact, FK relationships valid, JSON columns parse correctly
- [x] Test runs in CI on every PR that modifies `packages/db-types/src/schema/` or `src/db/drizzle-migrations/`
- [x] Test fails with a clear message if a migration drops rows, nullifies columns, or breaks FK constraints
- [x] Test covers a "new column added" migration: existing rows get the default value, no data loss
- [x] Test covers a "column renamed" migration: data preserved under the new name (or migration uses ALTER TABLE RENAME COLUMN)

## Notes

SQLite has limited ALTER TABLE support — it can add columns and rename columns, but cannot drop columns (pre-3.35) or change types. Migrations that need to restructure a table must use the "create new → copy data → drop old → rename new" pattern. The safety test catches cases where the copy step is missing.

This test doesn't need to run against every migration individually — it runs the full migration chain against a seeded DB and verifies the end state. If a new migration breaks data, the test fails.
