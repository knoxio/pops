# Epic: Schema Upgrade & Migration

**Theme:** Inventory
**Priority:** 0 (prerequisite to everything)
**Status:** Done

## Goal

Extend the existing `home_inventory` schema to support the location tree, item connections, asset IDs, photos, and rich notes. Migrate the existing table to Drizzle. Add tRPC routers for the new data model.

## Why first?

Every other epic — Notion import, UI, connections, Paperless, reporting — depends on the schema being in place. The current schema is a flat table with basic fields. The upgrade adds hierarchical locations, a connections junction table, photo references, and a notes field.

## Scope

### In scope

- Migrate existing `home_inventory` table to Drizzle schema (per ADR-011)
- Create `locations` table — self-referential tree with `parent_id`
  - Multiple root nodes: Home, Car, Storage Cage, etc.
  - Arbitrary depth: Home → Room → Furniture → Shelf → Drawer
  - Each location has: name, parent_id (nullable for roots), sort_order
- Create `item_connections` junction table — bidirectional physical links between items
  - `item_a_id`, `item_b_id` — both FK to inventory items
  - Unique constraint: only one connection row per pair (enforce A < B ordering to prevent duplicates)
  - No connection type — the item's own metadata carries the semantic meaning
- Add `asset_id` field to inventory items — unique, searchable, human-readable (HDMI01, ROUTER01, PB03)
- Add `notes` text field — free-form markdown for specs, details, observations
- Replace flat `room` and `location` select fields with `location_id` FK to the locations tree
- Add `item_photos` table — photo references per item (file path, sort order, caption)
- Update tRPC routers:
  - `inventory.locations.*` — CRUD for location tree (create, move, rename, delete, list tree)
  - `inventory.connections.*` — connect/disconnect items, list connections for an item
  - `inventory.items.*` — update existing CRUD to support new fields (asset_id, location_id, notes)
  - `inventory.photos.*` — attach/remove/reorder photos
- Update `@pops/db-types` with Drizzle-inferred types
- Update seed data with location tree and connections

### Out of scope

- Notion import (Epic 1)
- UI components (Epic 2)
- Connection graph visualisation (Epic 3)
- Paperless-ngx integration (Epic 4)
- Reporting or value aggregation (Epic 5)

## Deliverables

1. Drizzle schema files for: `inventory_items` (upgraded), `locations`, `item_connections`, `item_photos`
2. Migration from existing `home_inventory` table to new schema (data-preserving)
3. `locations` tRPC router with tree CRUD operations
4. `connections` tRPC router with connect/disconnect/list
5. Updated `items` tRPC router with new fields
6. `photos` tRPC router with attach/remove/reorder
7. `@pops/db-types` exports Drizzle-inferred types for all inventory tables
8. Unit tests for all new routers and services
9. `mise db:seed` updated with: location tree (Home with 3-4 rooms, each with 2-3 sub-locations), 10+ items with asset IDs across locations, 5-10 connections between items
10. `pnpm typecheck` and `pnpm test` pass

## Dependencies

- Foundation Epic 6 (Drizzle adoption) — Drizzle infrastructure must exist

## Risks

- **Migration of existing data** — The existing `home_inventory` table has 5 seeded items with `room` and `location` as text fields. These need to map to the new location tree. Mitigation: create locations from the existing room/location values during migration, set `location_id` accordingly.
- **Bidirectional connection deduplication** — If HDMI01 connects to TV, we don't want both (HDMI01, TV) and (TV, HDMI01) rows. Mitigation: enforce `item_a_id < item_b_id` ordering at the application level. The query layer checks both directions.
