# PRD-175: inventory.connections cutover

> Epic: [Remaining data migrations](../../epics/03-remaining-data-migrations.md)

## Overview

Move `inventory.connections.*` procedures (graph operations over `item_connections`) into `inventory.db`. Follows the canonical N-track pattern from [PRD-165](../165-media-movies-cutover/README.md).

Connections express how items relate: "component of," "paired with," "replaces," "backup for." Heavily traversal-oriented; the graph helpers in `graph.ts` compute reachability + cycles in-process.

## Data Model

Tables (move from shared to `packages/inventory-db`):

- `item_connections` — { id, source_item_id, target_item_id, connection_type, notes, created_at } (already in `inventory.db` after M4)

Self-referential graph; supports `ON DELETE CASCADE` when either endpoint is removed.

## API Surface

| Procedure                      | Kind                              |
| ------------------------------ | --------------------------------- |
| `inventory.connections.list`   | query                             |
| `inventory.connections.byItem` | query                             |
| `inventory.connections.create` | mutation                          |
| `inventory.connections.delete` | mutation                          |
| `inventory.connections.graph`  | query (returns traversal results) |

Files today: `apps/pops-api/src/modules/inventory/connections/{router.ts, service.ts, graph.ts}`.

## Business Rules

Follows [PRD-165's 4-PR sequence](../165-media-movies-cutover/README.md#business-rules--the-n-track-4-pr-sequence). Slice specifics:

- `graph.ts` does in-process BFS/DFS; not affected by the handle switch.
- Cutover gated on PRD-173 (items) — connections FK to items via item ids.

## Edge Cases

| Case                                                     | Behaviour                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| Cycles in connections graph                              | Existing detection in `graph.ts` preserved.                                 |
| Orphan connection (item deleted but connection survives) | CASCADE should prevent; if it slips, list query filters non-existent items. |

## User Stories

| #   | Story                                                       | Summary                                                        |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| 01  | [us-01-pr1-package-scaffold](us-01-pr1-package-scaffold.md) | PR 1 — Service exports for connections in `@pops/inventory-db` |
| 02  | [us-02-pr2-journal-split](us-02-pr2-journal-split.md)       | PR 2 — Drop from shared journal                                |
| 03  | [us-03-pr3-cutover](us-03-pr3-cutover.md)                   | PR 3 — Flip router to `getInventoryDrizzle()`                  |
| 04  | [us-04-pr4-shim-deletion](us-04-pr4-shim-deletion.md)       | PR 4 — Delete or defer shim                                    |

## Out of Scope

- Graph algorithm changes.
- New connection types beyond what exists.
- Visual graph rendering.
