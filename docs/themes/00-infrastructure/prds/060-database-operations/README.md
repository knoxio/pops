# PRD-060: Database Operations

> Epic: [07 — Database Operations](../../epics/07-database-operations.md)
> Status: Done

## Overview

Make the database safe for production data. Today, the codebase has two migration systems running in parallel, destructive commands with no environment guards, no pre-migration backups, and no documented procedure for going from dev to production. This PRD unifies the migration system, adds safety rails, and documents the go-live process.

## Current State

### Two Migration Systems

| System     | Location                     | Applied by                          | Used for                         |
| ---------- | ---------------------------- | ----------------------------------- | -------------------------------- |
| Manual SQL | `src/db/migrations/*.sql`    | `runMigrations()` on server startup | Production schema changes        |
| Drizzle    | `src/db/drizzle-migrations/` | `drizzle-kit migrate`               | New schema changes going forward |

Both systems track applied migrations separately (`schema_migrations` table vs Drizzle's `__drizzle_migrations` table). An agent adding a new table might use either system, leading to drift.

### Destructive Commands

| Command         | What it does                                               | Guard |
| --------------- | ---------------------------------------------------------- | ----- |
| `mise db:init`  | Deletes the entire SQLite file and recreates from scratch  | None  |
| `mise db:seed`  | Calls `db:clear` (deletes all data) then inserts test data | None  |
| `mise db:clear` | Deletes all rows from all tables (preserves schema)        | None  |

Running any of these against a production database destroys real data with no warning.

### Missing Safety Layers

- No automatic backup before schema migrations
- No test that verifies migrations preserve existing data
- No documentation on when to stop using `db:init` and start relying on migrations only

## Target State

- **One migration system** (Drizzle) — single source of truth for schema changes
- **Production guards** — destructive commands refuse to run against production databases
- **Pre-migration backup** — automatic SQLite backup before any migration runs
- **Migration safety tests** — CI verifies migrations don't lose data
- **Go-live runbook** — documented procedure for transitioning to real data

## Business Rules

- Drizzle is the only migration system going forward — manual SQL migrations are frozen (no new files)
- `runMigrations()` continues to apply existing manual migrations for backward compatibility but does not accept new ones
- `db:init`, `db:seed`, `db:clear` refuse to execute when `NODE_ENV=production` or when the database contains financial transactions
- Pre-migration backup creates a timestamped copy of the SQLite file before applying any pending migration
- If a migration fails, the database is restored from the pre-migration backup automatically
- The go-live runbook is stored in the repo (accessible when the server is down)

## Edge Cases

| Case                                                       | Behaviour                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No pending migrations                                      | Backup skipped, server starts normally                                                 |
| Migration fails mid-transaction                            | SQLite transaction rolls back; pre-migration backup available as additional safety net |
| `db:init` run with `NODE_ENV=production`                   | Command exits with error, does not delete the database                                 |
| `db:seed` run against DB with real transactions            | Command exits with error explaining why                                                |
| Both old and new migration systems have pending migrations | Old migrations run first (backward compat), then Drizzle migrations run                |
| Drizzle schema drift (schema file doesn't match DB)        | `drizzle-kit generate` detects drift and generates a corrective migration              |
| Agent creates a manual SQL migration file                  | CI lint step fails — manual migrations are frozen                                      |

## User Stories

| #   | Story                                                           | Summary                                                                                         | Status | Parallelisable   |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ | ---------------- |
| 01  | [us-01-unify-migrations](us-01-unify-migrations.md)             | Freeze manual SQL migrations, make Drizzle the only path for new schema changes                 | Done   | No (first)       |
| 02  | [us-02-production-guards](us-02-production-guards.md)           | Add environment checks to db:init, db:seed, db:clear that refuse to run against production data | Done   | Yes              |
| 03  | [us-03-pre-migration-backup](us-03-pre-migration-backup.md)     | Automatic SQLite file backup before any pending migration runs, with auto-restore on failure    | Done   | Yes              |
| 04  | [us-04-migration-safety-tests](us-04-migration-safety-tests.md) | CI test that applies migrations to a seeded DB and verifies data integrity                      | Done   | Blocked by us-01 |
| 05  | [us-05-go-live-runbook](us-05-go-live-runbook.md)               | Document the procedure for transitioning from dev database to production data                   | Done   | Yes              |
| 06  | [us-06-sqlite-path-fallback](us-06-sqlite-path-fallback.md)     | Replace [REDACTED] placeholder with sane default and startup assertion for missing SQLITE_PATH  | Done   | Yes              |

US-02, US-03, and US-05 can all parallelise. US-04 depends on US-01 (needs the unified migration system to test against).

## Verification

- Adding a new column via Drizzle schema + `drizzle-kit generate` produces a migration that applies cleanly to an existing DB with data
- `mise db:init` fails with a clear error when `NODE_ENV=production`
- `mise db:seed` fails with a clear error when the DB has real transactions
- Pre-migration backup is created before migrations run, and removed after successful completion
- A deliberately broken migration triggers auto-restore from the backup
- CI migration safety test passes on every PR that includes a schema change
- Go-live runbook exists in the repo and covers: initial import, backup verification, migration workflow

## Out of Scope

- Drizzle ORM adoption for query code (PRD-011)
- Schema design conventions (PRD-009)
- WAL archival or point-in-time recovery
- Database replication or read replicas
- Automated rollback of Drizzle migrations (Drizzle doesn't support down migrations — restore from backup instead)

## Drift Check

last checked: 2026-04-17
