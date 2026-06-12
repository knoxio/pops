# PRD-173: inventory.items cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `home_inventory` (the items table), `fixtures`, and the five `item_*` tables (`item_connections`, `item_documents`, `item_photos`, `item_uploaded_files`, `item_fixture_connections`) + `inventory.items.*` procedures into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

This is the inventory pillar's primary entity slice. Track L4 (Theme 12) already pre-staged the journal split work; PRD-173 finishes the data + router cutover.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `home_inventory` — items themselves; { id, name, location_id (FK → locations), brand, model, serial_number, purchase_date, purchase_price, notes, ... }
- `fixtures` — fixed items attached to a location (sinks, light fixtures, etc.)
- `item_connections` — graph edges between items (component-of, paired-with, replaces, etc.)
- `item_documents` — links to paperless-ngx documents
- `item_photos` — image metadata + file paths
- `item_uploaded_files` — generic file attachments
- `item_fixture_connections` — fixture → item relationships

Tables already exist in `inventory.db` from L4 / M4 work. PRD-173's PR 1 ports the `inventory.items.*` writer surface into `apps/pops-inventory-api` (router, service, builders, mapper + tests) so the dispatcher cutover can swap URLs without rewriting procedures; PRs 2-4 are the journal split + dispatcher cutover + shim deletion.

## API Surface

| Procedure                | Kind                                |
| ------------------------ | ----------------------------------- |
| `inventory.items.list`   | query                               |
| `inventory.items.get`    | query                               |
| `inventory.items.create` | mutation                            |
| `inventory.items.update` | mutation                            |
| `inventory.items.delete` | mutation                            |
| `inventory.items.search` | query (delegates to search adapter) |

Files today: `apps/pops-inventory-api/src/modules/items/{router.ts, service.ts, create-builder.ts, update-builder.ts, types.ts}` after PR 1. The legacy `apps/pops-api/src/modules/inventory/items/...` copies stay mounted as fall-through (marked `@deprecated`) until PR 3 flips the dispatcher and PR 4 removes them.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- Locations table moved during M4 PR 1. items already FK to `locations(id)` in `inventory.db`; cleanest cutover in the inventory family.
- Search adapter relocates per PRD-165's pattern.
- `idx_locations_parent_sort` was backfilled in #2923; ensure equivalent indexes on items' FK to locations stay in the per-pillar baseline.

## Edge Cases

| Case                                                       | Behaviour                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Item references a location that hasn't been backfilled yet | Backfill ordering ensures locations precede items; FK enforced. |
| Photo / document FKs to items that are mid-backfill        | Same ordering rule: items before children.                      |

## User Stories

| #   | Story                                                       | Summary                                                                   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Move the `inventory.items.*` writer into `apps/pops-inventory-api` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop tables from shared journal                                    |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Dispatcher / nginx cutover from pops-api to pops-inventory-api     |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete the legacy pops-api items module                            |

## Out of Scope

- Connections graph algorithm changes; only persistence moves.
- Photo upload pipeline; backend storage unchanged.
- Paperless document linkage (lives in PRD-176).
