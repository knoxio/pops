# PRD-176: inventory.documents cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `inventory.documents.*` procedures + `item_documents` table relationship management into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Documents are the linkage layer between inventory items and external document stores (primarily paperless-ngx — PRD-177 covers the paperless client). The `item_documents` table is the join surface.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `item_documents` — { id, item_id, document_source ('paperless' | 'local'), document_ref, label, attached_at } (already in `inventory.db` after M4)

## API Surface

| Procedure                    | Kind     |
| ---------------------------- | -------- |
| `inventory.documents.byItem` | query    |
| `inventory.documents.attach` | mutation |
| `inventory.documents.detach` | mutation |
| `inventory.documents.update` | mutation |

Files today: `apps/pops-api/src/modules/inventory/documents/{router.ts, service.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- The paperless-ngx client (PRD-177) is a separate concern; this PRD only moves the linkage table.
- Cutover gated on PRD-173 (items).

## Edge Cases

| Case                                                               | Behaviour                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Document references a paperless document_ref that no longer exists | Existing behaviour preserved; query returns the row, consumer handles. |
| Attach without paperless reachable                                 | Pure DB write; doesn't probe paperless.                                |

## User Stories

| #   | Story                                                       | Summary                                        |
| --- | ----------------------------------------------------------- | ---------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Service exports in `@pops/inventory-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getInventoryDrizzle()`  |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                    |

## Out of Scope

- Paperless client (PRD-177).
- New document sources beyond paperless + local.
- OCR / content extraction.
