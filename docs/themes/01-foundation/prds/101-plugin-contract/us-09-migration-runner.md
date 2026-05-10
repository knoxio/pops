# US-09: Migration runner consumes per-module migrations

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As an operator running a partial install (e.g. `POPS_APPS=finance`), I want only the installed modules' migrations to run so that absent modules don't leave their tables on disk consuming space and confusing operators.

Closes #2523.

## Acceptance Criteria

- [ ] Each module declares its migrations via `backend.migrations: MigrationDescriptor[]` in its manifest. `MigrationDescriptor` is `{ id: string; sql: string }` where `id` matches the canonical `schema_migrations` version key.
- [ ] Migration files are reorganised under `apps/pops-api/src/db/migrations/<module>/` (e.g. `migrations/finance/`, `migrations/cerebrum/`). Filename + content imported into the module's manifest.
- [ ] `core` migrations remain at `migrations/core/` and run unconditionally.
- [ ] Migration runner (`apps/pops-api/src/db/migrations-runner.ts`) reads the merged list from `MODULES.flatMap(m => m.backend?.migrations ?? [])` plus core's, sorts by `id`, and runs only un-applied entries.
- [ ] When a module is absent, its migrations are not in the list — runner does not insert them in `schema_migrations`. Re-enabling the module re-runs them on next boot.
- [ ] On boot: if `schema_migrations` contains version ids that no installed module owns, log a warning naming each (data is intact, just inaccessible — operator info, not an error).
- [ ] Drizzle workflow (`pnpm drizzle:generate`) outputs into the per-module folder for whichever module owns the touched schema (configured via `drizzle.config.ts` per module). Mixed-module schema changes fail with a clear error.
- [ ] Test: boot with `POPS_APPS=finance`, verify no cerebrum tables exist in the SQLite file. Re-boot with `POPS_APPS=finance,cerebrum`, verify cerebrum tables are created.

## Notes

- The "tables exist on disk for absent modules" gap (PRD-100 Out of Scope) is closed here.
- Drizzle multi-config is the right move because keeping one global drizzle config defeats the per-module ownership the contract demands.
- Cerebrum sub-modules (ego, glia, plexus, reflex, nudge) ship as one unit — all their migrations live under `migrations/cerebrum/`. Sub-module slicing is out of scope.
