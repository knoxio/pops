# Fixtures Data Model

Status: Partial — CRUD, connections, and the cascade-on-house-move property are shipped. The connection graph does **not** yet traverse fixtures, there is no per-fixture connection listing, and list has no free-text search. See [ideas/fixtures-graph-and-listing.md](../ideas/fixtures-graph-and-listing.md).

Fixtures are house infrastructure that items connect to but the user does not own: power outlets, ethernet ports, light switches, cable ports, wall HDMI plates. They live in their own table, separate from inventory items, so a house move is a clean operation: wipe the fixtures table and re-connect owned items to new fixtures without touching inventory.

Lives entirely in the inventory pillar's own SQLite DB, alongside `home_inventory`, `locations`, and the item connection graph.

## Data Model

### `fixtures`

| Column             | Type | Notes                                                                               |
| ------------------ | ---- | ----------------------------------------------------------------------------------- |
| `id`               | TEXT | PK, UUID (`crypto.randomUUID()`)                                                    |
| `name`             | TEXT | NOT NULL                                                                            |
| `type`             | TEXT | NOT NULL — free-text label, e.g. `power_outlet`, `ethernet_port`, `hdmi_wall_plate` |
| `location_id`      | TEXT | nullable, FK → `locations(id)` ON DELETE SET NULL                                   |
| `notes`            | TEXT | nullable                                                                            |
| `created_at`       | TEXT | NOT NULL, default `datetime('now')`                                                 |
| `last_edited_time` | TEXT | NOT NULL, ISO timestamp set on every write                                          |

Indexes: `idx_fixtures_location` (location_id), `idx_fixtures_type` (type), `idx_fixtures_name` (name).

### `item_fixture_connections`

| Column       | Type    | Notes                                                 |
| ------------ | ------- | ----------------------------------------------------- |
| `id`         | INTEGER | PK AUTOINCREMENT                                      |
| `item_id`    | TEXT    | NOT NULL, FK → `home_inventory(id)` ON DELETE CASCADE |
| `fixture_id` | TEXT    | NOT NULL, FK → `fixtures(id)` ON DELETE CASCADE       |
| `created_at` | TEXT    | NOT NULL, default `datetime('now')`                   |

Unique constraint `uq_item_fixture_connections_pair` on `(item_id, fixture_id)`. Indexes: `idx_item_fixture_conn_item` (item_id), `idx_item_fixture_conn_fixture` (fixture_id).

**House-move invariant:** deleting a fixture cascades to `item_fixture_connections` only — owned items are untouched. `DELETE FROM fixtures` empties the join table and leaves all inventory intact.

- [x] `fixtures` and `item_fixture_connections` tables exist with the columns, FKs, unique pair constraint, and indexes above.
- [x] Deleting a fixture cascade-deletes its connection rows; the connected items remain.
- [x] Deleting a location sets `location_id` to NULL on its fixtures (SET NULL FK); the fixtures remain.

## REST API Surface

The `fixtures.*` sub-router is mounted into the inventory ts-rest contract (`rest.ts`) and served by the inventory pillar.

| Method + Path                               | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /fixtures`                             | List fixtures; filters `locationId`, `type`, `limit`, `offset`; returns `{ data, total }`  |
| `GET /fixtures/:id`                         | Get one fixture                                                                            |
| `POST /fixtures`                            | Create (`name`, `type`, `locationId?`, `notes?`) → 201 `{ data, message }`                 |
| `PATCH /fixtures/:id`                       | Partial update (at least one field) → `{ data, message }`                                  |
| `DELETE /fixtures/:id`                      | Delete → `{ message }`                                                                     |
| `POST /items/:itemId/fixtures/:fixtureId`   | Connect item ↔ fixture → 201 `{ data, message }`                                           |
| `DELETE /items/:itemId/fixtures/:fixtureId` | Disconnect → `{ message }`                                                                 |
| `GET /items/:itemId/fixtures`               | List a given item's fixture connections; `limit`, `offset`; returns `{ data, pagination }` |

The public `Fixture` shape is `{ id, name, type, locationId, notes, createdAt, lastEditedTime }`. The connection shape is `{ id, itemId, fixtureId, createdAt }`.

The platform pillar's [MCP Server](../../../../docs/themes/platform/prds/mcp-server.md) exposes fixture CRUD and item-fixture connection tools on top of this contract — that PRD depends on this schema and these endpoints being live.

- [x] All eight endpoints above are wired through the contract and backed by the fixtures service.
- [x] `name` and `type` are required and rejected when empty on create; update requires at least one field.
- [x] List filters by `locationId` and `type`; default page size 50, max 500.

## Business Rules

- Fixture `name` is not unique — "Power Outlet" can appear in many rooms.
- `type` is free-text, not an enum — new fixture types never require a schema change.
- Delete always succeeds for an existing fixture; there is no confirmation flow. The connection cascade is the safety mechanism.

- [x] `POST /items/:itemId/fixtures/:fixtureId` returns 409 CONFLICT when the `(item_id, fixture_id)` pair already exists.
- [x] Connect returns 404 NOT_FOUND identifying which side is unknown (missing item vs. missing fixture) on FK violation.
- [x] `DELETE /items/:itemId/fixtures/:fixtureId` returns 404 NOT_FOUND when the connection does not exist.
- [x] `GET`/`PATCH`/`DELETE /fixtures/:id` return 404 NOT_FOUND for an unknown id.

## Edge Cases

| Case                                         | Behaviour                                         |
| -------------------------------------------- | ------------------------------------------------- |
| Delete a fixture with connected items        | Connection rows cascade-deleted; items unaffected |
| Delete a location holding fixtures           | Fixtures' `location_id` set NULL; fixtures remain |
| Connect with unknown `itemId` or `fixtureId` | 404 NOT_FOUND naming the missing side             |
| Connect an already-connected pair            | 409 CONFLICT                                      |
| Disconnect a non-existent pair               | 404 NOT_FOUND                                     |

## Not Built Here

Tracked in [ideas/fixtures-graph-and-listing.md](../ideas/fixtures-graph-and-listing.md): connection-graph/trace traversal of fixtures (fixture leaf nodes + `isFixture` flag), a per-fixture connection listing endpoint, and free-text search on the fixtures list.

Out of scope entirely: fixture-to-fixture connections, fixtures UI, fixture photos/document attachments, and typed connections (power/data/audio).
