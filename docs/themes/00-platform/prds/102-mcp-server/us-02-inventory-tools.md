# US-02: Inventory tools

> PRD: [PRD-102 — MCP Server](README.md)
> Status: Done

## Goal

Expose the inventory domain (locations, items, connections) as MCP tools. Locations and connections are the highest-priority surface per the initial requirements.

## Acceptance Criteria

- [x] `inventory.locations.tree` — calls `inventory.locations.tree` tRPC query, returns nested location tree
- [x] `inventory.locations.list` — calls `inventory.locations.list` tRPC query, returns flat array
- [x] `inventory.items.list` — accepts `search`, `locationId`, `includeChildren`, `type`, `condition`, `limit`, `offset`; calls `inventory.items.list`
- [x] `inventory.items.get` — accepts `id` (required); calls `inventory.items.get`
- [x] `inventory.connections.list` — accepts `itemId` (required), `limit`, `offset`; calls `inventory.connections.listForItem`
- [x] `inventory.connections.graph` — accepts `itemId` (required), `maxDepth`; calls `inventory.connections.graph`
- [x] All tools return JSON-serialised tRPC response as MCP text content
- [x] All optional inputs are correctly typed and pass `undefined` (not `null`) when absent
