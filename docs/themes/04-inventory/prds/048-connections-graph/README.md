# PRD-048: Connections & Graph

> Epic: [03 — Connections & Graph](../../epics/03-connections-graph.md)
> Status: Partial

## Overview

Build bidirectional item connections and connection chain tracing. One row in the connections table means both items see the link. Trace from a wall outlet through power boards to every connected device. Optional graph visualisation as a stretch goal.

## UI Components

### Connection Management (on item detail page)

- "Connect Item" button opens a search/select dialog
- Search by name or asset ID
- Select item to create connection (enforces `itemAId < itemBId` dedup)
- Connection list shows: item name, asset ID, type badge, "Disconnect" action
- Cannot connect an item to itself

### Chain Tracing

- "Trace Chain" button on any connected item
- Uses recursive CTE (`traceChain` procedure, `maxDepth = 10`)
- Displays chain as indented list or simple tree: Wall Outlet > Power Board > Router > Switch > ...
- Shows depth level for each hop
- Handles cycles gracefully (stops at `maxDepth`, no infinite loop)

### Graph Visualisation (stretch goal)

- Visual graph showing all connections as nodes and edges
- Nodes: item name + asset ID
- Edges: connection lines
- Interactive: click node to navigate to item detail
- Only shown for items with connections

## Business Rules

- **Bidirectional:** one row means both items see the connection
- **Dedup:** `itemAId < itemBId` enforced at application level, unique constraint at DB level
- **Self-connection prevented:** cannot connect an item to itself (rejected at API level)
- **Connection deletion:** disconnecting from either direction removes the single row
- **Max chain depth:** 10 (configurable) — prevents runaway recursion in cyclic graphs

## API Surface

| Procedure | Input | Output | Notes |
|-----------|-------|--------|-------|
| `inventory.connections.create` | itemAId, itemBId | `{ data: Connection }` | Enforces A<B, prevents self-connect, unique constraint |
| `inventory.connections.delete` | itemAId, itemBId | `{ message }` | Accepts either direction, normalises to A<B before delete |
| `inventory.connections.listForItem` | itemId | `{ data: Connection[] }` | All connections where item is A or B |
| `inventory.connections.traceChain` | itemId, maxDepth? (default 10) | `{ data: ChainNode[] }` | Recursive CTE, returns tree with depth levels |

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Connect item to itself | Rejected with validation error |
| Duplicate connection | Rejected with unique constraint error (409) |
| Disconnect non-existent connection | 404 |
| Chain trace on item with no connections | Returns single-node chain (just the item) |
| Chain trace hits maxDepth | Stops traversal, returns what it has — no error |
| Cyclic graph (A>B>C>A) | Cycle detected via visited set, stops at cycle point |
| Item deleted that has connections | Connections cascade-deleted (FK ON DELETE CASCADE) |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-connect-dialog](us-01-connect-dialog.md) | Connect dialog with item search, connection list on detail page, disconnect action | Partial | No (first) |
| 02 | [us-02-chain-tracing](us-02-chain-tracing.md) | Chain trace with recursive CTE, indented list display, depth indicators, cycle handling | Done | Blocked by us-01 |
| 03 | [us-03-graph-visualisation](us-03-graph-visualisation.md) | Interactive graph visualisation (stretch goal) with nodes/edges, click navigation | Done | Blocked by us-01 |

US-02 and US-03 can parallelise after US-01.

## Out of Scope

- Connection types or labels (power, data, audio — item metadata carries this)
- Automated connection discovery
- Connection weight or bandwidth metadata
