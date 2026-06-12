# PRD-212: pops.db readiness audit

> Epic: [Drop pops.db](../../epics/09-drop-pops-db.md)

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
