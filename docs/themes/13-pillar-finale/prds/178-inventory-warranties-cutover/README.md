# PRD-178: inventory.warranties cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Status

**Done by construction.** No N-track sequence to run.

## Overview

The earlier draft of this PRD assumed a standalone `warranties` table with its own `inventory.warranties.*` procedures. Neither exists in the codebase.

Warranty coverage is modelled as a denormalised column on the existing `home_inventory` row:

- `home_inventory.warranty_expires text` — single ISO date, indexed by `idx_inventory_warranty`.
- Linked warranty paperwork is tracked through `item_documents.document_type = 'warranty'` (owned by PRD-176).

Both `home_inventory` and `item_documents` already live in `packages/inventory-db` (`packages/inventory-db/migrations/0006_inventory_pillar_baseline.sql`). There is no shared-journal handle to drop, no router to flip, no shim to delete.

## What ships the warranty surface today

| Surface                              | Lives in                                                              | Storage                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `inventory.reports.warranties` query | `apps/pops-api/src/modules/inventory/reports/router.ts`               | Reads `home_inventory.warranty_expires` + LEFT JOIN `item_documents` (type = 'warranty') |
| `inventory.reports.dashboard` widget | `apps/pops-api/src/modules/inventory/reports/service.ts`              | `warrantiesExpiringSoon` count derived from `home_inventory.warranty_expires`            |
| Item create/update `warrantyExpires` | `packages/inventory-db/src/services/items-{create,update}-builder.ts` | Column on `home_inventory`                                                               |
| Warranty document linking            | `packages/inventory-db/src/services/documents-*.ts`                   | `item_documents.document_type = 'warranty'`                                              |
| `/inventory/warranties` UI           | `packages/app-inventory/src/routes.tsx`                               | Calls `inventory.reports.warranties` over the SDK                                        |

All paths already hit `inventory.db` via `getInventoryDrizzle()` (or via the per-pillar service in `@pops/inventory-db`). The cutover this PRD was scoped to perform has been performed implicitly by PRD-173 (items) and PRD-176 (documents).

## Why no standalone `warranties` table

The earlier draft proposed promoting warranty coverage into its own table with provider, coverage windows, claim URL, and per-warranty document refs. That is a product change, not a data migration:

- Today there is exactly one warranty per item (a single expiry date on the item row).
- Multiple warranty providers, claim portals, or overlapping coverage windows are not currently modelled or surfaced anywhere in the app.
- Promoting this is feature work — write a fresh PRD scoped to that product change, with its own data model, API surface, and UI plan. Do not relitigate it under a Theme 13 cutover ticket.

## Decision

Mark PRD-178 **Done by construction**. No PRs to ship under this slice.

If/when a standalone `warranties` table is added later, it is a new PRD outside Theme 13 — Theme 13's remit is moving existing tables into per-pillar packages, not introducing new product surface.

## Out of Scope

- Introducing a standalone `warranties` table or `inventory.warranties.*` procedures.
- Reminder/notification logic for expiring coverage.
- External warranty registry integrations.
