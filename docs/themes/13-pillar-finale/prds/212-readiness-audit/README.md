# PRD-212: pops.db readiness audit

> Epic: [Drop pops.db](../../epics/09-drop-pops-db.md)
>
> Status: In progress — first audit snapshot landed 2026-06-13. See
> [readiness-matrix.md](readiness-matrix.md) for the full per-table /
> per-caller breakdown.

## Snapshot (2026-06-13)

- **30 tables** are still copied at boot via the seven
  `apps/pops-api/src/db/*-backfill*.ts` `TABLE_COPIES` arrays.
- **29 of 30 block PRD-213.** Only `movies` has had its PR4
  drop-backfill step ship (commit `39dfdaae`).
- **147 production files** still call the legacy `getDrizzle()` handle
  (`pops.db`). Breakdown: media 70, core 21, food 19, cerebrum 18,
  cross-pillar infra 13, finance 4, lists 2.
- **9 cross-pillar infra hot-paths** (`jobs/*`, `lib/inference-pricing`,
  `routes/health`, `shared/tag-suggester`, `ai-budgets/enforcement`)
  have no owning Wave-3 PRD and need owners assigned before PRD-213.
- **13 Wave-3 PRDs** have shipped PR3 (writer cutover) but owe PR4
  (table drop + backfill entry removal).

See [readiness-matrix.md](readiness-matrix.md) for the table-by-table
matrix, residual call-site list, Wave-3 PRD cross-reference, and the
recommended sequence into PRD-213.

## Overview

Before dropping the legacy `pops.db`, confirm every table is owned by a pillar and no code still reaches into the shared DB. Uses Q1 schema-coverage CI data + grep audit + smoke harness.

## Data Model

No new data; produces an audit report.

## API Surface

Audit report at `docs/themes/13-pillar-finale/prds/212-readiness-audit/audit-report.md`:

```
| Table | Owner pillar | Migrated PRD | Still referenced in pops-api? |
| --- | --- | --- | --- |
| movies | media | #165 | No |
| transactions | finance | #2903 (Theme 12) | No |
| ... |
```

## Business Rules

- **Every table in `0000_naive_chameleon` is enumerated.** None can remain "owner unknown."
- **Every `getDb()` / `getDrizzle()` call site is identified.** Either migrated or explicitly retained for code that's about to be deleted.
- **Schema-coverage CI (#2917) data feeds the audit.**

## Edge Cases

| Case                      | Behaviour                                                            |
| ------------------------- | -------------------------------------------------------------------- |
| Discovered orphan table   | Document; recommend deletion if no consumers, or assign to a pillar. |
| Code still uses `pops.db` | Listed in audit; cross-referenced with its PRD's PR 4 status.        |

## User Stories

| #   | Story                                             | Summary                                          |
| --- | ------------------------------------------------- | ------------------------------------------------ |
| 01  | [us-01-table-inventory](us-01-table-inventory.md) | List every shared-DB table + its ownership       |
| 02  | [us-02-call-site-grep](us-02-call-site-grep.md)   | Find every `getDb` / `getDrizzle` call           |
| 03  | [us-03-audit-report](us-03-audit-report.md)       | Commit the report; flag remaining migration work |

## Out of Scope

- Performing migrations (each table has its own PRD in Epic 03).
- Dropping anything (PRD-213).
