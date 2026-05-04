# US-01: Unify migration system on Drizzle

> PRD: [060 — Database Operations](README.md)
> Status: Done

## Description

As a developer, I want Drizzle as the single migration system so that there is one way to change the schema and no confusion about which system to use.

## Acceptance Criteria

- [x] `MIGRATIONS_FROZEN.md` file added to `src/db/migrations/` explaining that manual SQL migrations are frozen — no new files accepted
- [x] CI lint step fails if a new `.sql` file is added to `src/db/migrations/` (e.g., a pre-commit hook or GitHub Action check)
- [x] `runMigrations()` in `db.ts` still applies existing manual SQL migrations (backward compatibility for databases that have them)
- [x] Drizzle migrations in `src/db/drizzle-migrations/` are applied by `drizzle-kit migrate` after manual migrations complete
- [x] Server startup sequence: `runMigrations()` (old) → Drizzle migrate (new) → server ready
- [x] `mise drizzle:generate` is the documented workflow for schema changes: edit schema in `packages/db-types/src/schema/` → run generate → review SQL → commit
- [x] `CONVENTIONS.md` updated: "Schema changes go through Drizzle only — edit the schema file, run `mise drizzle:generate`, review the SQL, commit both"
- [x] Existing `drizzle.config.ts` baseline warning preserved (don't re-apply baseline to existing prod DBs)

## Notes

The manual migration system served well during early development but having two systems creates ambiguity. Freezing (not deleting) the old system preserves backward compatibility while ensuring all new work goes through Drizzle.

The CI check can be a simple shell command in the PR workflow: `git diff --name-only origin/main | grep 'src/db/migrations/.*\.sql$' && exit 1 || true`.
