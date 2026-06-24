# Connections & Graph

> Status: Done

Bidirectional item-to-item connections, chain tracing, and an interactive connection graph. One `item_connections` row links two inventory items and both items see it. Trace from a wall outlet through power boards to every connected device, or render the whole connected component as a force-directed graph.

## Data Model

`item_connections` (inventory pillar's own SQLite DB):

- `id` — autoincrement PK
- `itemAId`, `itemBId` — both FK to `home_inventory.id`, `ON DELETE CASCADE`
- `createdAt` — `datetime('now')`

Invariants enforced at the schema level:

- `UNIQUE(itemAId, itemBId)` — one row per pair
- `CHECK(itemAId < itemBId)` — canonical pair ordering, so a pair is stored exactly once regardless of insertion order
- Indexes on `itemAId` and `itemBId` for either-direction lookups

## REST API

ts-rest contract under `connections.*`:

| Method & path                          | Purpose                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `POST /connections`                    | Connect two items (`{ itemAId, itemBId }`). Normalises to A<B. |
| `DELETE /connections?itemAId&itemBId`  | Disconnect a pair; accepts either ordering.                    |
| `GET /items/:itemId/connections`       | Paginated list of connections where the item is A or B.        |
| `GET /items/:itemId/connections/trace` | Connection chain rooted at the item as a recursive tree.       |
| `GET /items/:itemId/connections/graph` | Connected subgraph as `{ nodes, edges }`.                      |

`trace` and `graph` take `maxDepth` (coerced int, 1–10, default 10). `connect` returns `201 { data, message }`. A trace node is `{ id, itemName, assetId, type, children[] }`; a graph node is `{ id, itemName, assetId, type }` and an edge is `{ source, target }`.

## Business Rules

- **Bidirectional, single-row:** one row means both items see the connection; disconnecting from either direction removes that single row.
- **Pair normalisation:** the service sorts the caller's two ids to satisfy `A<B` before any insert / lookup / delete, so callers may pass ids in any order.
- **Self-connection rejected:** `itemAId === itemBId` is refused before any DB work (409 Conflict).
- **Duplicate rejected:** an existing pair (after normalisation) is refused (409 Conflict).
- **Endpoints must exist:** both item ids are validated against `home_inventory`; a missing item yields 404.
- **Bounded traversal:** both `trace` and `graph` walk by BFS with a visited set, capped at `maxDepth` (default 10) — cycles and dense fan-out terminate; no per-node re-querying in the graph builder (in-memory adjacency).
- **Cascade:** deleting an inventory item cascade-deletes its connection rows.

## Acceptance Criteria

Connect & list (item detail page):

- [x] "Connect Item" opens a search-picker dialog; typing ≥2 chars searches items by name / asset id via the items list endpoint.
- [x] Each result shows item name, brand/model, asset-id badge, and type badge; the current item is filtered out of results so it cannot connect to itself.
- [x] Selecting a result calls `POST /connections` with the current and selected item; success toasts "Items connected" and refetches the list.
- [x] A duplicate pair surfaces a "These items are already connected" toast (driven by the 409).
- [x] The "Connected Items" section lists each connected item (resolving the non-current side of the pair) with name, asset-id badge, type badge; rows link to the connected item's detail page.
- [x] Empty state: "No connected items yet."
- [x] Each row has a "Disconnect" action behind a confirm dialog ("Disconnect {item}?"); confirming calls `DELETE /connections` and refreshes.

Chain trace:

- [x] When the item has ≥1 connection, a "Connection Chain" section renders the trace tree (no separate trigger button — the panel is shown by default).
- [x] Trace data comes from `GET /items/:itemId/connections/trace` with `maxDepth=10`.
- [x] Rendered as an indented, collapsible tree; each node shows name, asset-id badge, type badge, and a child count; the root is the current item, marked "(current)".
- [x] Clicking a non-current node navigates to that item's detail page; keyboard (Enter/Space) works.
- [x] Header shows the count of connected items in the chain (root excluded).
- [x] Cycles terminate: a node already visited is not re-expanded, so the tree stays finite; traversal also stops at `maxDepth`.
- [x] Loading shows a skeleton; on error, "Failed to load connection trace."; when the pillar is unavailable, "Connection chain unavailable."

Graph:

- [x] A "View Graph" toggle in the chain section swaps the trace panel for a force-directed canvas graph.
- [x] Graph data comes from `GET /items/:itemId/connections/graph` with `maxDepth=10`.
- [x] Nodes are positioned by an in-browser force simulation; the canvas supports scroll-to-zoom, drag-to-pan, and click-a-node-to-navigate.
- [x] Graph is scoped to the connected component of the current item, not the whole inventory.
- [x] Fewer than two nodes shows "Not enough connections to display a graph."; loading shows a skeleton; on error "Failed to load connection graph."; when unavailable, "Connection graph unavailable."

## Edge Cases

| Case                                  | Behaviour                                         |
| ------------------------------------- | ------------------------------------------------- |
| Connect item to itself                | 409 Conflict (also filtered out of the UI search) |
| Duplicate pair (either ordering)      | 409 Conflict                                      |
| Connect with a missing item id        | 404 Not Found                                     |
| Disconnect a non-existent pair        | 404 Not Found                                     |
| Trace / graph from item with no edges | Single-node result (just the item)                |
| Traversal hits `maxDepth`             | Stops expanding, returns what it has — no error   |
| Cyclic graph (A–B–C–A)                | Visited set prevents re-expansion; finite result  |
| Item deleted that has connections     | Rows cascade-deleted via FK `ON DELETE CASCADE`   |

## Out of Scope

- Connection types or labels (power / data / audio) — item metadata carries this.
- Automated connection discovery.
- Connection weight / bandwidth metadata.
