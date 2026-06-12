# PRD-185: core.corrections cleanup (post-finance-reclaim)

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Finalise the `core.corrections.*` namespace cleanup. Same shape as [PRD-184](../184-core-tag-rules-cutover/README.md) — Epic 08a does the actual rename + relocation; PRD-185 audits and closes.

The `transaction_corrections` table is already in `finance.db` (Theme 12 N3). Epic 08a moves the service + router code to `pops-finance-api` and renames the tRPC namespace to `finance.corrections.*`.

## Data Model

No new data.

## API Surface

Renamed namespace (per Epic 08a):

- `core.corrections.*` → `finance.corrections.*`

## Business Rules

Verification / cleanup PRD — single PR:

- `grep -rn "core.corrections" apps/ packages/` returns zero hits in source.
- `apps/pops-api/src/modules/core/corrections/` directory no longer exists.
- Documentation: note in the finance pillar's runbook about the rename.

## Edge Cases

Same as PRD-184; see that PRD for the audit checklist pattern.

## User Stories

| #   | Story                                                 | Summary                                        |
| --- | ----------------------------------------------------- | ---------------------------------------------- |
| 01  | [us-01-audit-and-cleanup](us-01-audit-and-cleanup.md) | Single PR: grep audit + cleanup + runbook note |

## Out of Scope

- The actual rename / data move (Epic 08a).
- The cutover semantics (Theme 12 N3).
- AI Ops integrations that call corrections (Epic 07 territory).
