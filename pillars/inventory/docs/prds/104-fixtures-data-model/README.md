# PRD-104: Fixtures Data Model

> Epic: [Fixtures & MCP Interface](../../epics/06-fixtures-mcp-interface.md)

## Overview

Introduce fixtures as a first-class entity representing house infrastructure that items connect to but that the user does not own (power outlets, ethernet ports, light switches, wall HDMI plates, etc.). Fixtures live in a separate table from inventory items — so when the user moves house, they can wipe the fixtures table and re-connect owned items to new fixtures without touching the inventory.

## Data Model

### `fixtures` table

| Column             | Type | Constraints                                                                                      |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| `id`               | TEXT | PRIMARY KEY, UUID                                                                                |
| `name`             | TEXT | NOT NULL                                                                                         |
| `type`             | TEXT | nullable — e.g. `power_outlet`, `ethernet_port`, `light_switch`, `cable_port`, `hdmi_wall_plate` |
| `location_id`      | TEXT | nullable, FK → `locations(id)` ON DELETE SET NULL                                                |
| `notes`            | TEXT | nullable                                                                                         |
| `created_at`       | TEXT | NOT NULL, DEFAULT now()                                                                          |
| `updated_at`       | TEXT | NOT NULL, DEFAULT now()                                                                          |
| `last_edited_time` | TEXT | NOT NULL                                                                                         |

Indexes: `idx_fixtures_location` on `location_id`, `idx_fixtures_type` on `type`, `idx_fixtures_name` on `name`.

### `item_fixture_connections` table

| Column       | Type    | Constraints                                           |
| ------------ | ------- | ----------------------------------------------------- |
| `id`         | INTEGER | PRIMARY KEY AUTOINCREMENT                             |
| `item_id`    | TEXT    | NOT NULL, FK → `home_inventory(id)` ON DELETE CASCADE |
| `fixture_id` | TEXT    | NOT NULL, FK → `fixtures(id)` ON DELETE CASCADE       |
| `created_at` | TEXT    | NOT NULL, DEFAULT now()                               |

Unique constraint on `(item_id, fixture_id)`. Indexes: `idx_ifc_item` on `item_id`, `idx_ifc_fixture` on `fixture_id`.

**Cascade behaviour:** deleting a fixture cascades to `item_fixture_connections` only — the item itself is untouched. This is the key property that makes house moves clean: `DELETE FROM fixtures` leaves all owned items intact.

## API Surface

New tRPC router: `inventory.fixtures.*` (mounted alongside the existing `items`, `locations`, `connections` sub-routers).

### Fixtures CRUD

| Procedure         | Type     | Input                                                  | Output                               |
| ----------------- | -------- | ------------------------------------------------------ | ------------------------------------ |
| `fixtures.list`   | query    | `search?`, `locationId?`, `type?`, `limit?`, `offset?` | `{ data: Fixture[], total: number }` |
| `fixtures.get`    | query    | `{ id }`                                               | `{ data: Fixture }`                  |
| `fixtures.create` | mutation | `{ name, type?, locationId?, notes? }`                 | `{ data: Fixture, message }`         |
| `fixtures.update` | mutation | `{ id, data: { name?, type?, locationId?, notes? } }`  | `{ data: Fixture, message }`         |
| `fixtures.delete` | mutation | `{ id }`                                               | `{ message }`                        |

### Item-Fixture Connections

| Procedure                  | Type     | Input                            | Output                                          |
| -------------------------- | -------- | -------------------------------- | ----------------------------------------------- |
| `fixtures.connect`         | mutation | `{ itemId, fixtureId }`          | `{ data: ItemFixtureConnection, message }`      |
| `fixtures.disconnect`      | mutation | `{ itemId, fixtureId }`          | `{ message }`                                   |
| `fixtures.listConnections` | query    | `{ fixtureId, limit?, offset? }` | `{ data: ItemFixtureConnection[], pagination }` |
| `fixtures.listForItem`     | query    | `{ itemId, limit?, offset? }`    | `{ data: ItemFixtureConnection[], pagination }` |

### Graph extension

`inventory.connections.graph` and `inventory.connections.trace` must be extended to also traverse `item_fixture_connections`. Fixtures appear as leaf nodes in the graph — they have no outbound connections to other nodes. Graph node shape gains an optional `isFixture: boolean` flag so consumers can style fixture nodes differently.

## Business Rules

- Fixture names are not required to be unique — "Power Outlet" can appear in multiple rooms.
- `fixtures.delete` always succeeds if the fixture exists; there is no confirmation flow (unlike locations). The cascade on `item_fixture_connections` is the safety mechanism.
- `fixtures.connect` returns CONFLICT if the `(item_id, fixture_id)` pair already exists.
- `fixtures.disconnect` returns NOT_FOUND if the connection does not exist.
- The `type` field is free-text, not an enum — new fixture types should not require a schema change.

## Edge Cases

| Case                                                    | Behaviour                                                               |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Delete a fixture with connected items                   | Connection rows are cascade-deleted; items remain unaffected            |
| Delete a location that has fixtures                     | `location_id` on fixtures is set to NULL (SET NULL FK); fixtures remain |
| `fixtures.connect` with unknown `itemId` or `fixtureId` | NOT_FOUND from FK violation                                             |
| Graph traversal hits a fixture node                     | Fixture is added as a leaf node with `isFixture: true`; traversal stops |

## User Stories

| #   | Story                                               | Summary                                                            | Parallelisable   |
| --- | --------------------------------------------------- | ------------------------------------------------------------------ | ---------------- |
| 01  | [us-01-schema-migration](us-01-schema-migration.md) | `fixtures` + `item_fixture_connections` tables + migration         | Yes              |
| 02  | [us-02-fixtures-trpc](us-02-fixtures-trpc.md)       | Full tRPC router for fixtures CRUD + connections + graph extension | Blocked by US-01 |

## Out of Scope

- Fixture-to-fixture connections
- UI for fixtures
- Fixture photos or document attachments
- Connection types (power, data, audio)
