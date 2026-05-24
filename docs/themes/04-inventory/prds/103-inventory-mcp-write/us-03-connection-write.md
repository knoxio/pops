# US-03: Item-Connection Write Tools

> PRD: [Inventory MCP Write Tools](README.md)

## Description

As a user describing the physical setup in a room, I want to tell Claude which items are connected to each other (cables, power, peripherals) and have it record or remove those relationships.

## Acceptance Criteria

- [ ] `inventory.connections.connect` tool exists in `inventoryTools` and calls `inventory.connections.connect.mutate({ itemAId, itemBId })`
- [ ] `inventory.connections.connect` returns `isError: true` when either `itemAId` or `itemBId` is missing or empty
- [ ] `inventory.connections.connect` returns the created connection record `{ id, itemAId, itemBId, createdAt }` on success
- [ ] `inventory.connections.connect` surfaces a clear error when the pair is already connected (tRPC CONFLICT → `isError: true`)
- [ ] `inventory.connections.disconnect` tool exists and calls `inventory.connections.disconnect.mutate({ itemAId, itemBId })`
- [ ] `inventory.connections.disconnect` returns `isError: true` when either ID is missing or empty
- [ ] `inventory.connections.disconnect` returns a success message on removal
- [ ] `inventory.connections.disconnect` surfaces a clear error when the connection does not exist (tRPC NOT_FOUND → `isError: true`)
- [ ] Both tools have vitest tests covering the above cases
- [ ] `mockClient.inventory.connections` in `test-helpers.ts` includes `connect.mutate` and `disconnect.mutate` mocks

## Notes

The IDs can be passed in any order — the tRPC layer enforces `item_a_id < item_b_id` ordering automatically. The MCP tool does not need to sort them.

These tools cover item-to-item connections only. Item-to-fixture connections are a separate tool set in PRD-105.
