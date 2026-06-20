# US-02: Chain tracing

> PRD: [048 — Connections & Graph](README.md)
> Status: Done

## Description

As a user, I want to trace the full chain of connected items from any starting point so that I can see everything linked to a device (e.g., wall outlet through power board to all connected devices).

## Acceptance Criteria

- [x] "Trace Chain" button appears on item detail page when the item has at least one connection — trace panel shown by default when connections exist; no dedicated "Trace Chain" button (panel always visible in connections section)
- [x] Clicking "Trace Chain" calls `inventory.connections.traceChain` with the current item ID — procedure is `inventory.connections.trace` (naming differs from spec, same behaviour)
- [x] Chain displayed as an indented list (tree format): each level indented further than its parent
- [x] Each node in the chain shows: item name, asset ID, depth level indicator (e.g., "Depth 2")
- [x] Starting item shown as the root node at depth 0
- [x] Clicking any node in the chain navigates to that item's detail page
- [x] Chain traversal stops at `maxDepth = 10` — no error, just stops expanding
- [x] Cyclic graphs handled: if a node has already been visited, it shows as "[item name] (cycle)" and does not expand further
- [x] Loading state while chain fetches
- [x] Item with no connections: "Trace Chain" button hidden
- [x] Single-item chain (item connected to one other): shows two-node chain

## Notes

The recursive CTE runs server-side. It maintains a visited set to detect cycles and respects maxDepth. The response is a flat list with `depth` and `parentItemId` fields that the client assembles into a tree for display. The CTE walks all edges bidirectionally (since connections are stored once with A<B).
