# PRD-251: Close H7 — cross-pillar denormalisation for inventory + finance

> Epic: [Pillar isolation](../../epics/) (final-mile)
>
> Status: **Not started**

## Overview

PRD-245 closed the SQL-level half of audit H7 — every `.references()` under `packages/*-db/src/` is now intra-pillar. The denormalisation half survives: production data still leans on cross-pillar object identity. Replacement = URI-shaped soft references plus a periodic reconciliation cron.

Three pairs:

1. inventory → finance — purchase-side context
2. inventory → core — owner reference
3. finance → core — owner reference on entities + budgets

Cerebrum → media debrief denorm already landed.

## Surface

- `packages/inventory-db/src/schema/items.ts` — add `purchaseTransactionUri`, `ownerUri` + indices
- `packages/finance-db/src/schema/{entities,budgets}.ts` — add `ownerUri` + index
- `apps/pops-inventory-api/src/cron/reconcile-cross-pillar.ts` (new)
- `apps/pops-finance-api/src/cron/reconcile-cross-pillar.ts` (new)

## Business Rules

- Existence is best-effort. URI-no-resolve → warning, not delete.
- Read-time fan-out forbidden. Reads from denorm columns; live SDK calls only inside the cron.
- Owner-side writes only.
- Inherits PRD-244 typed-proxy patterns for outbound calls.

## Edge Cases

| Case                     | Behaviour                                                                  |
| ------------------------ | -------------------------------------------------------------------------- |
| Owning pillar 404        | `staleAt = now`; don't delete                                              |
| Owning pillar slow/down  | Cron logs + retries next tick                                              |
| URI parses, type unknown | 404 path; log for ops                                                      |
| Backfill missing URI     | Migration populates from legacy join column where possible, NULL otherwise |

## User Stories

| #   | Story                      | Parallelisable |
| --- | -------------------------- | -------------- |
| 01  | inventory → finance denorm | Yes            |
| 02  | inventory → core denorm    | Yes            |
| 03  | finance → core denorm      | Yes            |

## Acceptance Criteria

- Zero `.references()` calls in `packages/{inventory,finance}-db/src/` cross a pillar boundary
- Each cron has unit tests for ok / 404 / unavailable / bad-URI
- Integration test boots core + inventory + finance, runs cron, asserts denorm cache
- `pnpm typecheck/test/build` clean

## Out of Scope

- Live read-time fan-out
- Cerebrum → media debrief (done)
- Bulk ops cleanup of pre-existing FK violations in production data

## References

- Pillar isolation audit 2026-06 §H7
- PRD-244 typed-proxy
- PRD-245 SQL-half closure
- ADR-026
