# PRD-174: inventory.reports cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `inventory.reports.*` (insurance reports + related views) into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Reports are generated aggregations of the inventory: total value, per-room summaries, insurance schedules. Today they're computed views over `home_inventory` + `locations` + `item_photos`; after PRD-173 lands, all source data is in `inventory.db` and the report generators just need their handle flipped.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `insurance_reports` — generated report metadata; { id, title, generated_at, criteria_json, file_path }
- Plus uses joins over `home_inventory`, `locations`, `item_photos`, `item_documents` (all already in `inventory.db` after PRD-173).

## API Surface

| Procedure                    | Kind     |
| ---------------------------- | -------- |
| `inventory.reports.list`     | query    |
| `inventory.reports.generate` | mutation |
| `inventory.reports.get`      | query    |
| `inventory.reports.delete`   | mutation |

Files today: `apps/pops-api/src/modules/inventory/reports/{router.ts, service.ts, insurance-report.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Report generation is read-heavy; the cutover only affects which handle joins are computed against.
- Generated PDF/CSV files are stored on disk; file paths are absolute and survive the cutover.

## Edge Cases

| Case                                                                | Behaviour                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Report generation references items that haven't been backfilled yet | PRD-173 (items) must land first; gates this PRD's PR 3.     |
| Generated file path is stale (file deleted out-of-band)             | Existing behaviour preserved; report row returns null file. |

## User Stories

| #   | Story                                                       | Summary                                           |
| --- | ----------------------------------------------------------- | ------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Schema + service into `@pops/inventory-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                   |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getInventoryDrizzle()`     |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                       |

## Out of Scope

- Report templates / formatting changes.
- New report types beyond insurance.
- Cloud export of generated reports.
