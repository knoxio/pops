# PRD-104: Fixtures Data Model

> Theme: [04 — Inventory](../../README.md)
> Epic: [06 — Fixtures](../../epics/06-fixtures.md)
> Status: Done

## Overview

Fixtures are physical infrastructure objects that items can be connected to but that POPS does not own (power outlets, wall-mounted panels, cable runs, patch bays). A fixture has a name, type, optional location, and optional notes. Items connect to fixtures via a join table with a unique pair constraint — one item can connect to multiple fixtures; a fixture can host multiple items.

## Motivation

Items in the connectivity graph connect to other items. But many real physical connections terminate at infrastructure (wall outlets, patch panels) that aren't inventory items. Fixtures model this without polluting the item table with non-owned entities. When moving house, the fixtures table is emptied and items reconnect to new fixtures — no item data changes needed.

## Data Model

### `fixtures` table

| Column             | Type    | Constraints                                   |
| ------------------ | ------- | --------------------------------------------- |
| `id`               | text PK | UUID, `$defaultFn(() => crypto.randomUUID())` |
| `name`             | text    | NOT NULL                                      |
| `type`             | text    | NOT NULL                                      |
| `location_id`      | text FK | References `locations.id`, SET NULL on delete |
| `notes`            | text    | Nullable                                      |
| `created_at`       | text    | NOT NULL, default `datetime('now')`           |
| `last_edited_time` | text    | NOT NULL                                      |

Indexes: `idx_fixtures_location`, `idx_fixtures_type`, `idx_fixtures_name`

### `item_fixture_connections` table

| Column       | Type       | Constraints                                       |
| ------------ | ---------- | ------------------------------------------------- |
| `id`         | integer PK | Auto-increment                                    |
| `item_id`    | text FK    | References `home_inventory.id`, CASCADE on delete |
| `fixture_id` | text FK    | References `fixtures.id`, CASCADE on delete       |
| `created_at` | text       | NOT NULL, default `datetime('now')`               |

Constraints: `UNIQUE(item_id, fixture_id)`
Indexes: `idx_item_fixture_conn_item`, `idx_item_fixture_conn_fixture`

## API Surface

All routes under `inventory.fixtures.*` via `protectedProcedure`:

| Procedure     | Type     | Input                                                                 | Returns                         |
| ------------- | -------- | --------------------------------------------------------------------- | ------------------------------- |
| `list`        | query    | `locationId?`, `type?`, `limit`, `offset`                             | `{ data: Fixture[], total }`    |
| `get`         | query    | `id`                                                                  | `{ data: Fixture }`             |
| `create`      | mutation | `name`, `type`, `locationId?`, `notes?`                               | `{ data: Fixture, message }`    |
| `update`      | mutation | `id`, `name?`, `type?`, `locationId?` (nullable), `notes?` (nullable) | `{ data: Fixture, message }`    |
| `delete`      | mutation | `id`                                                                  | `{ message }`                   |
| `connect`     | mutation | `itemId`, `fixtureId`                                                 | `{ data: Connection, message }` |
| `disconnect`  | mutation | `itemId`, `fixtureId`                                                 | `{ message }`                   |
| `listForItem` | query    | `itemId`, `limit`, `offset`                                           | `{ data: Connection[], total }` |

## Business Rules

- Fixture `type` is free text — no enumeration enforcement.
- `locationId` may be null — some fixtures (e.g. a ceiling cable run) don't map to a precise location node.
- When a location is deleted, `location_id` is set to null (SET NULL FK), fixture is retained.
- When a fixture is deleted, all `item_fixture_connections` rows cascade-delete.
- When an item is deleted, its `item_fixture_connections` rows cascade-delete.
- Connecting the same item to the same fixture twice raises `ConflictError` → `CONFLICT` tRPC error.
- Connecting to a nonexistent item or fixture raises `NotFoundError` → `NOT_FOUND` tRPC error.
- No ordering constraint on `(item_id, fixture_id)` — unlike item-item connections which enforce `A < B`.

## Migration

Migration `0057_slimy_phalanx` — creates both tables and all indexes. Owned by `inventory` module.

## User Stories

| US    | Title                 | Status |
| ----- | --------------------- | ------ |
| US-01 | Schema & migration    | Done   |
| US-02 | tRPC service & router | Done   |
