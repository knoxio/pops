# PRD-174: inventory.reports cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)
>
> **Status: Done (no work required).** The slice owns no tables of its own — it is a runtime aggregation router over inventory tables owned by neighbouring PRDs. See [Investigation](#investigation) below.

## Overview

`inventory.reports.*` is a read-only aggregation surface — dashboard summaries, warranty lists, value breakdowns, and the insurance report — computed at request time over `home_inventory`, `item_photos`, `item_documents`, and `locations`. There is no `insurance_reports` table, no report cache, no persisted report metadata. Reports are produced by read-only DB queries (some using SQL aggregates, others by reading rows and grouping in-memory) and returned to the caller; nothing is written.

Because the slice owns zero schema, the canonical 4-PR N-track sequence (package scaffold → journal split → handle flip → shim deletion) does not apply. The handle the router uses (`getInventoryDrizzle()`) already resolves to `inventory.db` once the source tables move there under their own PRDs.

This PRD is preserved as a documented no-op so the epic's slice list stays complete and so a future agent doesn't reopen the question.

## Investigation

Surveyed `apps/pops-api/src/modules/inventory/reports/` (2026-06-13):

| File                  | Role                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router.ts`           | tRPC router exposing `dashboard`, `warranties`, `insuranceReport`, `valueByLocation`, `valueByType`.                                                                                                                        |
| `service.ts`          | Aggregation queries (counts, sums, warranty windows, recent items, value-by-X breakdowns) via `drizzle-orm`.                                                                                                                |
| `insurance-report.ts` | Report over `home_inventory` + `locations` + `item_photos` + `item_documents`. Reads each table with `select().all()`, then assembles lookup maps and groups items by location in memory (no SQL join, no SQL aggregation). |
| `types.ts`            | `DashboardSummary`, `RecentItem`, `ValueBreakdownEntry`. All response shapes; no row types.                                                                                                                                 |
| `index.ts`            | Re-export only.                                                                                                                                                                                                             |

Grep results that confirm the no-DB picture:

- `insurance_reports` — does not exist anywhere in the repo (no schema, no migration, no Drizzle type, no SQL).
- `insuranceReports` — does not exist anywhere in the repo as a Drizzle table.
- All four tables the router joins (`homeInventory`, `itemPhotos`, `itemDocuments`, `locations`) come from `@pops/db-types`; their cutover is owned by **PRD-173 (`inventory.items`)** and **PRD-176 (`inventory.documents`)**.
- The handle is `getInventoryDrizzle()` (already pillar-scoped). Once PRD-173 and PRD-176 land, that handle resolves to `inventory.db` for every join — no router change needed here.

The actual wire surface today is:

| Procedure                           | Kind  | Computes                                                                                                                                                                                                                           |
| ----------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory.reports.dashboard`       | query | Item count, total replacement value, total resale value, count of warranties expiring in the next 90 days, 5 most-recently-edited items.                                                                                           |
| `inventory.reports.warranties`      | query | Every item with a non-null `warrantyExpires`, sorted by expiry; left-joined with `item_documents` to surface the warranty's Paperless document id (`itemDocuments.paperlessDocumentId`, not a local `item_documents.id`).          |
| `inventory.reports.insuranceReport` | query | Items grouped by location (optionally restricted to a location subtree), each with primary photo path, replacement value, and receipt Paperless document ids (`itemDocuments.paperlessDocumentId`, not local `item_documents.id`). |
| `inventory.reports.valueByLocation` | query | `SUM(replacementValue)` grouped by `locations.name` (with an `Unassigned` bucket).                                                                                                                                                 |
| `inventory.reports.valueByType`     | query | `SUM(replacementValue)` grouped by `homeInventory.type` (with an `Uncategorized` bucket).                                                                                                                                          |

The earlier draft of this PRD described an `insurance_reports` table with `{ id, title, generated_at, criteria_json, file_path }` and procedures `list` / `generate` / `get` / `delete`. None of those exist. The live shape is "aggregate-on-read"; reports are never persisted, never cached, and never have a file path.

### PRD discrepancy

The original PRD-174 data model and API table were copy-paste from the canonical PRD-165 template without a fact check against `apps/pops-api/src/modules/inventory/reports/`. Two corrections:

1. **No `insurance_reports` table.** The router computes the report on every call. There is no `criteria_json`, no `file_path`, no `generated_at`.
2. **No `list` / `generate` / `get` / `delete` procedures.** The router exposes five read-only queries (see table above).

Either the original PRD captured a speculative future-state design, or it was templated from PRD-165 (`media.movies`) without inspection. Either way, the live shape is "runtime aggregation over inventory tables".

## Decision

**No PRs to ship.** The slice is complete-by-construction:

- No own schema → nothing to move to `inventory.db`.
- No shared-journal entries to drop (PR2-equivalent is a no-op).
- No router handle to flip — `getInventoryDrizzle()` is already the pillar-scoped handle, and its target follows the source tables under PRD-173 / PRD-176.
- No shim to delete (PR4-equivalent is a no-op).

When PRD-173 (items) and PRD-176 (documents) land, every join in this router automatically resolves against `inventory.db` with zero change to `reports/`. That is the entire "cutover" for this slice.

If a future feature persists generated reports (e.g. signed PDF snapshots, saved insurance schedules with criteria captured at generation time), that work goes in a **new** PRD scoped to those tables — not in PRD-174.

## Dependencies

- **Reads from (no writes):** `home_inventory`, `item_photos`, `item_documents`, `locations` — all owned by PRD-173 (items + photos) and PRD-176 (documents).
- **Coupled to:** PRD-173 and PRD-176 landing first so the joined tables actually live on `inventory.db`. No code change required in `reports/` after they land.

## Out of Scope

- New report types (saved insurance schedules, depreciation reports, time-series value tracking) — would need their own PRD with their own tables.
- Report caching or pre-computation — current aggregations are cheap; no performance need identified.
- PDF / CSV export of reports — not part of the current router; would need a new PRD.
- Changes to the underlying inventory tables — owned by PRD-173 / PRD-176.
