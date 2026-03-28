# US-01: Establish migration conventions

> PRD: [009 — DB Schema Patterns](README.md)
> Status: Done

## Description

As a developer, I want documented migration conventions, a template file, and a working migration runner so that new domains can add tables consistently.

## Acceptance Criteria

- [x] Timestamp-based naming convention established (`YYYYMMDDHHMMSS_domain_description.sql`)
- [x] Template migration file created at `apps/pops-api/src/db/migration-template.sql` with header format and rollback section
- [x] Migration runner in `db.ts` creates `schema_migrations` table, reads migration directory, applies unapplied migrations in order
- [x] `initializeSchema()` creates all tables from scratch for fresh databases
- [x] `INCLUDED_MIGRATIONS` array pre-marks migrations as applied for fresh DBs
- [x] `PRAGMA foreign_keys = ON` set on every database connection
- [x] Flat migration directory at `apps/pops-api/src/db/migrations/`

## Notes

Two database initialisation paths: production (incremental migrations) and fresh (full schema + pre-marked migrations). Both must produce identical schemas.
