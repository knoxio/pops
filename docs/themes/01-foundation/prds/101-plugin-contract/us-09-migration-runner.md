# US-09: Migration runner consumes per-module migrations

> PRD: [Plugin Contract](README.md)
> Status: Partial

## Description

As an operator running a partial install (e.g. `POPS_APPS=finance`), I want only the installed modules' migrations to run so that absent modules don't leave their tables on disk consuming space and confusing operators.

Closes #2523.

## Acceptance Criteria

- [x] Each module declares the migrations it owns as part of its manifest, with an id matching the canonical migration version key and the SQL body to apply.
- [ ] ~~Migration files are reorganised into per-module folders so each module owns its own SQL files on disk.~~ Files stay in the historical flat layout; manifests reference them by id. See Notes.
- [x] Core migrations are owned by the core module and always run, because core is always present.
- [x] The migration runner walks the migration journal in order and applies only entries whose owning module is in the install set.
- [x] When a module is absent, its migrations are not applied and not recorded. Re-enabling the module on a subsequent boot runs them naturally.
- [x] On boot, if the migrations ledger contains entries for tags whose owning module is now absent, log a warning naming each. Data is preserved; the warning is operator info, not an error.
- [ ] The migration-generation workflow outputs into the per-module location for whichever module owns the touched schema. Deferred — the underlying tooling is incompatible with the historical flat baseline. New migrations are declared by adding the tag to the owning module's manifest. A contract guard catches drift.
- [x] Tests verify that absent-module migrations are skipped without recording, that re-running with the same install set is a no-op, that adding an absent module on a re-run applies its previously-skipped tags, and that orphan warnings fire when a previously-installed module is removed. Fresh-database schema slicing (zero tables for absent modules in a brand-new database file) is deferred — the legacy schema initialiser still creates every table because it predates modularisation.

## Notes

- The "tables exist on disk for absent modules" gap (PRD-100 Out of Scope) is closed at the migration-application boundary. Slicing the legacy schema initialiser is a follow-up — fresh databases still see every table created at init time.
- Migration files stay where the generator puts them. Each module declares an ordered list of tags it owns and reads the SQL bodies via a shared loader. A static ownership map mirrors the same data for boot-time use, since the runtime cannot import the live manifest graph without creating an import cycle. A contract-guard test verifies the two stay in sync.
- Cerebrum sub-modules (ego, glia, plexus, reflex, nudge) ship as one unit — all their migrations live under cerebrum's ownership. Sub-module slicing is out of scope.
