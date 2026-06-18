# US-02: Item-Fixture Connection MCP Tools

> PRD: [Fixture MCP Tools](README.md)

## Description

As a user, I want to tell Claude "the TV is plugged into the power outlet on the north wall" and have it record that connection between an owned item and a fixture.

## Acceptance Criteria

- [ ] `inventory.fixtures.connect` tool exists, calls `inventory.fixtures.connect.mutate({ itemId, fixtureId })`
- [ ] `inventory.fixtures.connect` returns `isError: true` when either `itemId` or `fixtureId` is missing or empty
- [ ] `inventory.fixtures.connect` returns the created connection record on success
- [ ] `inventory.fixtures.connect` surfaces a clear error when the pair is already connected (tRPC CONFLICT → `isError: true`)
- [ ] `inventory.fixtures.disconnect` tool exists, calls `inventory.fixtures.disconnect.mutate({ itemId, fixtureId })`
- [ ] `inventory.fixtures.disconnect` returns `isError: true` when either ID is missing or empty
- [ ] `inventory.fixtures.disconnect` returns a success message on removal
- [ ] `inventory.fixtures.disconnect` surfaces a clear error when the connection does not exist (tRPC NOT_FOUND → `isError: true`)
- [ ] `inventory.fixtures.listForItem` tool exists, calls `inventory.fixtures.listForItem.query({ itemId })`; returns all fixtures connected to the given item
- [ ] All three tools have vitest tests covering success paths and invalid-input error paths
- [ ] `mockClient.inventory.fixtures` in `test-helpers.ts` includes `connect.mutate`, `disconnect.mutate`, `listForItem.query` mocks

## Notes

Unlike item-item connections, there is no A < B ordering constraint here — `item_fixture_connections` is directional by design (an item connects to a fixture, never the reverse). The `itemId` and `fixtureId` are always passed as-is to tRPC.
