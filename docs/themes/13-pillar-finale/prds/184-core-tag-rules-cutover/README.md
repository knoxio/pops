# PRD-184: core.tagRules cleanup (post-finance-reclaim)

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Finalise the `core.tagRules.*` namespace cleanup. After [Epic 08a](../../epics/08a-reclaim-misnamed-finance.md) ships, the data and service code already live in `pops-finance-api` under `finance.tagRules.*`. This PRD is a small audit + verification: confirm the misnamed module is fully gone from pops-api, confirm consumers all use the new namespace, document the cleanup.

This PRD is "in epic 03" by number, but functionally it's a follow-on to Epic 08a — the actual data move happened in Theme 12 (N4 PR 3 #2908; N4 PR 4 deferred). Epic 08a does the namespace rename. PRD-184 verifies and closes.

## Data Model

No new data. The `transaction_tag_rules` table is already in `finance.db` (per Theme 12 N4).

## API Surface

Renamed namespace (per Epic 08a):

- `core.tagRules.*` → `finance.tagRules.*`

PRD-184 verifies all consumers of the old namespace have migrated.

## Business Rules

This is a **verification / cleanup PRD**, not a 4-PR sequence. Single PR shape:

- Audit: `grep -rn "core.tagRules" apps/ packages/` returns zero hits outside of historical comments + roadmap docs.
- Audit: `grep -rn "core/tag-rules" apps/ packages/` returns zero hits in source files.
- Confirm: the `apps/pops-api/src/modules/core/tag-rules/` directory no longer exists.
- Documentation: short note in the finance pillar's runbook explaining the namespace rename + the historical context (why it was misnamed in the first place).

## Edge Cases

| Case                                                                      | Behaviour                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A lingering test imports from `apps/pops-api/src/modules/core/tag-rules/` | Test fails to compile; PR includes the fix.                                                       |
| Documentation references the old name                                     | Update; preserve a historical note for context.                                                   |
| External consumer (e.g. CLI) still calls `core.tagRules.*`                | Already a hard-fail on the dispatcher; no compat shim. CLI is migrated as part of Epic 08a us-03. |

## User Stories

| #   | Story                                                 | Summary                                              |
| --- | ----------------------------------------------------- | ---------------------------------------------------- |
| 01  | [us-01-audit-and-cleanup](us-01-audit-and-cleanup.md) | Single PR: grep audit + final cleanup + runbook note |

## Out of Scope

- The actual rename / data move (Epic 08a).
- The cutover semantics (Theme 12 N4).
- Tag suggester logic (Epic 08a us-01 moves it).
