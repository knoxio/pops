# Fixtures: graph traversal, per-fixture listing, and search

Forward-looking gaps carved out of the shipped [fixtures-data-model](../prds/fixtures-data-model.md). The fixture tables, CRUD, connect/disconnect, and per-item listing all exist; the three items below were specified but never built.

## Connection graph + trace traversal of fixtures

Today `connections-graph.ts` and the trace service only walk `item_connections` (item↔item edges). They do not touch `item_fixture_connections`, and `GraphNode` has no way to mark a fixture.

Build:

- Extend the graph and trace traversals so that, after walking item↔item edges, each visited item also pulls its `item_fixture_connections` neighbours.
- Fixtures are **leaf** nodes: add them to the result but never recurse out of them (a fixture has no outbound edges).
- Add an optional `isFixture: boolean` to `GraphNode` (and the trace node) so consumers can style/stop at fixture nodes.
- A fixture node's label comes from `fixtures.name`; its `type` from `fixtures.type`.

Acceptance:

- Tracing an item connected to a fixture returns the fixture as a leaf node flagged `isFixture: true`, with no children/outbound edges.
- The graph for an item includes its fixtures as nodes and the item→fixture edges, without traversing beyond them.

## Per-fixture connection listing

There is a per-item listing (`GET /items/:itemId/fixtures`) but no inverse: no way to ask "which items are plugged into this fixture?".

Build a `GET /fixtures/:fixtureId/items` (or `GET /fixtures/:fixtureId/connections`) endpoint returning the `item_fixture_connections` rows for a fixture, paginated `{ data, pagination }`, mirroring the per-item handler.

## Free-text search on fixtures list

`GET /fixtures` filters by `locationId` and `type` only. Add a `search?` query param matching against `name` (and optionally `notes`), so fixtures can be found by label the same way items can.
