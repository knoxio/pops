# PRD-178: inventory.warranties cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `inventory.warranties.*` procedures + the `warranties` table into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Warranties track per-item coverage windows + linked documents. Read-heavy with periodic write on purchase. Small slice.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `warranties` — { id, item_id (FK), provider, coverage_start, coverage_end, contact, claim_url, document_ref, notes }

## API Surface

| Procedure                           | Kind                 |
| ----------------------------------- | -------------------- |
| `inventory.warranties.list`         | query                |
| `inventory.warranties.byItem`       | query                |
| `inventory.warranties.create`       | mutation             |
| `inventory.warranties.update`       | mutation             |
| `inventory.warranties.delete`       | mutation             |
| `inventory.warranties.expiringSoon` | query (next 90 days) |

Files today: `apps/pops-api/src/modules/inventory/warranties/` (router + service).

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Cutover gated on PRD-173 (items) due to FK.
- `expiringSoon` is a date-range query; preserve index on `coverage_end` in the per-pillar baseline.

## Edge Cases

| Case                                            | Behaviour                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Warranty references an item that's been deleted | Existing FK rule preserved (CASCADE or SET NULL — match current schema). |
| `expiringSoon` query timezone semantics         | Server timezone used; preserved across cutover.                          |

## User Stories

| #   | Story                                                       | Summary                                         |
| --- | ----------------------------------------------------------- | ----------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schema + service in `@pops/inventory-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                 |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getInventoryDrizzle()`   |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                     |

## Out of Scope

- Reminder notification logic.
- External warranty registries.
