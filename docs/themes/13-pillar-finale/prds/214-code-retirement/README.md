# PRD-214: Code retirement

> Epic: [Drop pops.db](../../epics/09-drop-pops-db.md)

## Overview

After PRD-213 lands and `pops.db` is empty, retire the code that references it. `apps/pops-api/src/db.ts` exports go away; backfill modules retire; the shared volume mount on pops-api can be removed.

## Data Model

No data.

## API Surface

Removals:

- `apps/pops-api/src/db.ts` — `getDb()`, `getDrizzle()` exports
- `apps/pops-api/src/db/backfill-finance-from-shared.ts` and siblings
- `apps/pops-api/src/db/drizzle-config-builder.ts`'s shared-mode branch
- `SQLITE_PATH` env wiring (pops-api no longer needs it)

## Business Rules

- **One PR for the entire code retirement.** No partial state.
- **pops-api still serves the residual cross-pillar code** (search orchestrator etc.); it just doesn't open `pops.db` anymore.
- **homelab-infra compose updates to drop the shared volume mount** as a follow-up.

## Edge Cases

| Case                                  | Behaviour                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| Test fixture imports `getDb`          | Update; use SDK + in-memory pillar.                                                           |
| Migration runner references `pops.db` | Migration runner stays in place but its database target is the per-pillar set, not `pops.db`. |

## User Stories

| #   | Story                                                 | Summary                                                                  |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| 01  | [us-01-remove-db-exports](us-01-remove-db-exports.md) | Delete `getDb` / `getDrizzle` + every importer                           |
| 02  | [us-02-retire-backfill](us-02-retire-backfill.md)     | Delete `backfill-*-from-shared.ts` modules                               |
| 03  | [us-03-volume-unmount](us-03-volume-unmount.md)       | homelab-infra: drop `sqlite-data` volume mount from pops-api (follow-up) |
| 04  | [us-04-cleanup-imports](us-04-cleanup-imports.md)     | grep + cleanup remaining unused imports                                  |

## Out of Scope

- Litestream replica retirement (separate homelab-infra concern).
- Renaming pops-api (E08b decision).
- Documentation overhaul (rolling).
