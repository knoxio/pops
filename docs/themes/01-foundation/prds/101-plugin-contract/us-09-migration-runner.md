# US-09: Migration runner consumes per-module migrations

> PRD: [Plugin Contract](README.md)
> Status: Partial

## Description

As an operator running a partial install (e.g. `POPS_APPS=finance`), I want only the installed modules' migrations to run so that absent modules don't leave their tables on disk consuming space and confusing operators.

Closes #2523.

## Acceptance Criteria

- [x] Each module declares its migrations via `backend.migrations: MigrationDescriptor[]` in its manifest. `MigrationDescriptor` is `{ id: string; sql: string }` where `id` matches the canonical `schema_migrations` version key.
- [ ] ~~Migration files are reorganised under `apps/pops-api/src/db/migrations/<module>/` (e.g. `migrations/finance/`, `migrations/cerebrum/`). Filename + content imported into the module's manifest.~~ Files stay in the drizzle-managed flat layout; manifests reference them by tag. See Notes.
- [x] `core` migrations are owned by the `core` module and run whenever any other module is installed (core is always-present).
- [x] Migration runner (`apps/pops-api/src/db/per-module-migrations.ts`) reads the merged ownership map from `MODULES.flatMap(m => m.backend?.migrations ?? [])`, walks the drizzle journal in order, and runs only entries whose owning module is in the install set.
- [x] When a module is absent, its migrations are not applied — runner does not insert them in `__drizzle_migrations`. Re-enabling the module re-runs them on next boot.
- [x] On boot: if `__drizzle_migrations` contains hashes for tags whose owning module is now absent, log a warning naming each (data is intact, just inaccessible — operator info, not an error).
- [ ] Drizzle workflow (`pnpm drizzle:generate`) outputs into the per-module folder for whichever module owns the touched schema. Deferred — drizzle multi-config is incompatible with the historical flat baseline. New migrations are declared by adding the tag to the owning module's `MIGRATION_TAGS` list and to `migration-ownership.ts`. CI guard catches drift.
- [x] Test: tagged tests verify (a) absent-module migrations are skipped without recording, (b) re-running with the same install set is a no-op, (c) adding an absent module on a re-run applies its previously-skipped tags, (d) orphan warnings fire when a previously-installed module is removed. Fresh-DB schema slicing (zero tables for absent modules in a brand-new SQLite file) is deferred — `initializeSchema()` still creates every table because it predates modularisation.

## Notes

- The "tables exist on disk for absent modules" gap (PRD-100 Out of Scope) is closed at the migration-application boundary. Slicing the legacy `initializeSchema()` is a follow-up — fresh databases still see every table created at init time.
- Files stay where drizzle-kit puts them. Each module's `migrations.ts` declares an ordered list of tags it owns and reads the SQL bodies via a shared loader. The static `migration-ownership.ts` mirrors the same map for boot-time use, since `db.ts` cannot import the live manifest graph without an import cycle. A contract-guard test verifies the two stay in sync.
- Cerebrum sub-modules (ego, glia, plexus, reflex, nudge) ship as one unit — all their migrations live under cerebrum's ownership. Sub-module slicing is out of scope.
