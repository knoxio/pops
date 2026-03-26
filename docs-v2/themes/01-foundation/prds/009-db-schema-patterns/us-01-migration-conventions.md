# US-01: Establish migration conventions

> PRD: [009 — DB Schema Patterns](README.md)
> Status: To Review

## Description

As a developer, I want documented migration conventions, a template file, and a working migration runner so that new domains can add tables consistently.

## Acceptance Criteria

- [ ] Timestamp-based naming convention established (`YYYYMMDDHHMMSS_domain_description.sql`)
- [ ] Template migration file created at `apps/pops-api/src/db/migration-template.sql` with header format and rollback section
- [ ] Migration runner in `db.ts` creates `schema_migrations` table, reads migration directory, applies unapplied migrations in order
- [ ] `initializeSchema()` creates all tables from scratch for fresh databases
- [ ] `INCLUDED_MIGRATIONS` array pre-marks migrations as applied for fresh DBs
- [ ] `PRAGMA foreign_keys = ON` set on every database connection
- [ ] Flat migration directory at `apps/pops-api/src/db/migrations/`

## Notes

Two database initialisation paths: production (incremental migrations) and fresh (full schema + pre-marked migrations). Both must produce identical schemas.
