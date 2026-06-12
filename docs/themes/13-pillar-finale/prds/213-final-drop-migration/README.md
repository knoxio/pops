# PRD-213: Final drop migration

> Epic: [Drop pops.db](../../epics/09-drop-pops-db.md)

## Overview

Author the migration that drops every legacy table from `pops.db`. Gated on PRD-212 (readiness audit) showing all-green.

## Data Model

A new shared migration: `apps/pops-api/src/db/drizzle-migrations/0099_drop_legacy_shared_tables.sql`:

```sql
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS tv_shows;
-- ...one per legacy table
DROP TABLE IF EXISTS settings;
-- ...
```

The migration is the last entry in the shared journal.

## API Surface

No new endpoints.

## Business Rules

- **Single migration that drops everything.** Atomic.
- **Gated on PRD-212's audit being green.**
- **Backfill code is retired in PRD-214** (same release window).
- **Litestream's pops.db replica continues replicating** an empty DB for a transition period; deprovisioned manually after stability.

## Edge Cases

| Case                                                             | Behaviour                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Migration runs against a DB still in use by a forgotten consumer | Crash; rollback; identify consumer; iterate. Gating by PRD-212 should prevent.                 |
| Foreign key constraint blocks DROP                               | Audit catches; FK target must be dropped first or `PRAGMA foreign_keys=OFF` for the migration. |

## User Stories

| #   | Story                                               | Summary                                           |
| --- | --------------------------------------------------- | ------------------------------------------------- |
| 01  | [us-01-author-migration](us-01-author-migration.md) | Write `0099_*.sql` with every DROP                |
| 02  | [us-02-fk-handling](us-02-fk-handling.md)           | Disable + re-enable foreign_keys around the drops |
| 03  | [us-03-deploy](us-03-deploy.md)                     | Deploy; verify all pillar containers stay healthy |

## Out of Scope

- Code retirement (PRD-214).
- Removing `pops.db` from compose / volumes (PRD-214 or homelab-infra concern).
