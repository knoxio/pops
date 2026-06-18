# US-02: Fixtures tRPC Router

> PRD: [Fixtures Data Model](README.md)

## Description

As a developer, I want a complete tRPC router for fixtures so the MCP layer (and future UI) has a typed API to create, read, update, and delete fixtures and manage item-fixture connections.

## Acceptance Criteria

- [ ] `apps/pops-api/src/modules/inventory/fixtures/` directory exists with `router.ts`, `service.ts`, `types.ts`
- [ ] `types.ts` exports: `FixtureSchema`, `CreateFixtureSchema`, `UpdateFixtureSchema`, `Fixture` type, `toFixture` mapper, `ItemFixtureConnectionSchema`, `toConnection` mapper
- [ ] `service.ts` implements: `listFixtures`, `getFixture`, `createFixture`, `updateFixture`, `deleteFixture`, `connectItemToFixture`, `disconnectItemFromFixture`, `listConnectionsForFixture`, `listFixturesForItem`
- [ ] `router.ts` exports `fixturesRouter` with procedures: `list`, `get`, `create`, `update`, `delete`, `connect`, `disconnect`, `listConnections`, `listForItem`
- [ ] `fixturesRouter` is mounted on the inventory router as `inventory.fixtures.*`
- [ ] `fixtures.connect` throws CONFLICT if the pair already exists; throws NOT_FOUND if either ID is invalid
- [ ] `fixtures.disconnect` throws NOT_FOUND if the connection does not exist
- [ ] `inventory.connections.graph` and `inventory.connections.trace` services are extended to traverse `item_fixture_connections` and include fixture nodes with `isFixture: true` in the result
- [ ] Unit tests exist for the service layer covering: create, list (with filters), get (found + not found), update, delete (cascades connections), connect (success + conflict), disconnect (success + not found)

## Notes

Follow the same service/router/types pattern used by `apps/pops-api/src/modules/inventory/connections/`. The graph extension is a query change in `connections/service.ts` — fixtures appear as leaf nodes, so the recursive traversal should add fixture neighbours but not recurse into them (fixtures have no outbound connections).
