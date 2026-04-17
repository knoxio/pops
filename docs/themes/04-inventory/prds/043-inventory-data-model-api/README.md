# PRD-043: Inventory Data Model & API

> Epic: [00 — Schema & Data Model](../../epics/00-schema-data-model.md)
> Status: Partial

## Overview

Define the inventory domain schema and build the tRPC routers that all other inventory features depend on. Four tables cover items with rich metadata, hierarchical locations, bidirectional item connections, and photos. Items use auto-increment integer PKs with optional human-readable asset IDs. Cross-domain references to finance (transaction and entity) use TEXT UUIDs.

## Data Model

### items

| Column                | Type    | Constraints                           | Description                                    |
| --------------------- | ------- | ------------------------------------- | ---------------------------------------------- |
| id                    | INTEGER | PK, auto-increment                    |                                                |
| name                  | TEXT    | NOT NULL                              | Item name                                      |
| type                  | TEXT    | NOT NULL                              | "electronics", "furniture", "appliance", etc.  |
| brand                 | TEXT    | nullable                              | Manufacturer                                   |
| model                 | TEXT    | nullable                              | Model number                                   |
| assetId               | TEXT    | UNIQUE, nullable                      | Human-readable ID (e.g., "HDMI01", "ROUTER01") |
| locationId            | INTEGER | FK → locations(id) ON DELETE SET NULL | Current location                               |
| condition             | TEXT    | DEFAULT 'good'                        | "new", "good", "fair", "poor", "broken"        |
| purchaseDate          | TEXT    | nullable                              | ISO date                                       |
| purchasePrice         | REAL    | nullable                              | Original cost                                  |
| replacementValue      | REAL    | nullable                              | Current replacement cost                       |
| resaleValue           | REAL    | nullable                              | Current resale value                           |
| warrantyExpiry        | TEXT    | nullable                              | ISO date                                       |
| notes                 | TEXT    | nullable                              | Markdown text                                  |
| purchaseTransactionId | TEXT    | nullable                              | FK to finance transaction (TEXT UUID)          |
| purchasedFromId       | TEXT    | nullable                              | FK to finance entity (TEXT UUID)               |
| createdAt             | TEXT    | NOT NULL                              | ISO timestamp                                  |
| updatedAt             | TEXT    | NOT NULL                              | ISO timestamp                                  |

**Indexes:** assetId (UNIQUE), locationId, type, name, warrantyExpiry

### locations

| Column    | Type    | Constraints                                    | Description                   |
| --------- | ------- | ---------------------------------------------- | ----------------------------- |
| id        | INTEGER | PK, auto-increment                             |                               |
| name      | TEXT    | NOT NULL                                       | Location name                 |
| parentId  | INTEGER | FK → locations(id) ON DELETE CASCADE, nullable | Parent location (null = root) |
| sortOrder | INTEGER | DEFAULT 0                                      | Display order among siblings  |
| createdAt | TEXT    | NOT NULL                                       | ISO timestamp                 |

**Indexes:** parentId, (parentId + sortOrder)

### item_connections

| Column    | Type    | Constraints                      | Description                  |
| --------- | ------- | -------------------------------- | ---------------------------- |
| id        | INTEGER | PK, auto-increment               |                              |
| itemAId   | INTEGER | FK → items(id) ON DELETE CASCADE | First item (enforced: A < B) |
| itemBId   | INTEGER | FK → items(id) ON DELETE CASCADE | Second item                  |
| createdAt | TEXT    | NOT NULL                         | ISO timestamp                |

**Indexes:** (itemAId + itemBId) UNIQUE, itemBId

Application-level enforcement: `itemAId < itemBId` prevents duplicate bidirectional entries. A connection (3, 7) and (7, 3) are the same relationship — always store as (3, 7).

### item_photos

| Column    | Type    | Constraints                      | Description   |
| --------- | ------- | -------------------------------- | ------------- |
| id        | INTEGER | PK, auto-increment               |               |
| itemId    | INTEGER | FK → items(id) ON DELETE CASCADE | Parent item   |
| filename  | TEXT    | NOT NULL                         | File name     |
| sortOrder | INTEGER | DEFAULT 0                        | Display order |
| createdAt | TEXT    | NOT NULL                         | ISO timestamp |

**Indexes:** itemId

Photo storage path: `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg`

## API Surface

### inventory.items

| Procedure         | Input                                                                             | Output                         | Notes                                                                         |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `list`            | search?, type?, locationId?, includeChildren?, condition?, limit (50), offset (0) | `{ data: Item[], pagination }` | Ordered by name ASC                                                           |
| `get`             | id                                                                                | `{ data: Item }`               | Includes location breadcrumb, connection count, photo count. 404 if not found |
| `create`          | data                                                                              | `{ data: Item }`               | Validates assetId uniqueness, sets createdAt/updatedAt                        |
| `update`          | id, data (partial)                                                                | `{ data: Item }`               | Partial update, updates updatedAt                                             |
| `delete`          | id                                                                                | `{ message }`                  | Cascades photos and connections via FK                                        |
| `searchByAssetId` | assetId                                                                           | `{ data: Item } \| null`       | Exact match, case-insensitive                                                 |

### inventory.locations

| Procedure  | Input                            | Output                     | Notes                                                                               |
| ---------- | -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `getTree`  | (none)                           | `{ data: LocationNode[] }` | Recursive tree with item counts per location                                        |
| `getPath`  | id                               | `{ data: Location[] }`     | Breadcrumb array from root to this location                                         |
| `create`   | name, parentId?                  | `{ data: Location }`       | Root if no parentId                                                                 |
| `update`   | id, name?, parentId?, sortOrder? | `{ data: Location }`       | Rename, move, reorder                                                               |
| `delete`   | id, force?                       | `{ message }`              | Cascades children; orphans items (locationId → NULL). force=true skips confirmation |
| `getItems` | id, includeChildren?             | `{ data: Item[] }`         | Items at this location, optionally including subtree                                |

### inventory.connections

| Procedure     | Input                  | Output                      | Notes                                    |
| ------------- | ---------------------- | --------------------------- | ---------------------------------------- |
| `connect`     | itemAId, itemBId       | `{ data: Connection }`      | Enforces A<B ordering, unique constraint |
| `disconnect`  | itemAId, itemBId       | `{ message }`               | Normalises order before delete           |
| `listForItem` | itemId                 | `{ data: ConnectedItem[] }` | Queries both A and B sides               |
| `traceChain`  | itemId, maxDepth? (10) | `{ data: ChainItem[] }`     | Recursive CTE, returns connected chain   |

### inventory.photos

| Procedure     | Input              | Output              | Notes                                                   |
| ------------- | ------------------ | ------------------- | ------------------------------------------------------- |
| `upload`      | itemId, file       | `{ data: Photo }`   | Multipart, compress (1920px max, HEIC→JPEG, strip EXIF) |
| `delete`      | id                 | `{ message }`       | Removes record + file from disk                         |
| `reorder`     | itemId, photoIds[] | `{ message }`       | Sets sort order based on array position                 |
| `listForItem` | itemId             | `{ data: Photo[] }` | Sorted by sortOrder ASC                                 |

## Business Rules

- Auto-increment integer PKs for all inventory tables — cross-domain FKs (purchaseTransactionId, purchasedFromId) are TEXT to match the finance domain's UUID scheme
- Location deletion cascades to child locations but orphans items (locationId set to NULL via ON DELETE SET NULL)
- Two identical physical items get separate rows with different asset IDs (e.g., HDMI01, HDMI02)
- Asset IDs are human-readable, unique, and optional — not all items need one
- Warranty dates are fully optional; NULL means "no warranty"
- Location tree supports arbitrary depth and multiple roots (Home, Car, Storage Cage)
- Connection deduplication: enforce `itemAId < itemBId` at application level so (3,7) and (7,3) resolve to the same row
- Photo compression on upload: resize to 1920px max dimension, convert HEIC to JPEG, strip EXIF metadata
- `traceChain` uses a recursive CTE with configurable max depth (default 10) to prevent infinite loops

## Edge Cases

| Case                                            | Behaviour                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Duplicate assetId on create/update              | Unique constraint error — return validation error                                                |
| Delete location with children                   | CASCADE deletes all descendant locations; items at those locations get locationId=NULL           |
| Delete item with connections                    | FK CASCADE removes connection rows                                                               |
| Delete item with photos                         | FK CASCADE removes photo records; application deletes files from disk                            |
| Connect item to itself                          | Validation error (itemAId must differ from itemBId)                                              |
| Duplicate connection (3,7) when (7,3) requested | Application normalises to (3,7); unique constraint catches duplicates                            |
| traceChain hits max depth                       | Stops recursion, returns chain up to that depth                                                  |
| searchByAssetId with no match                   | Returns null                                                                                     |
| Location tree with circular parentId            | Self-referential FK prevents direct cycles; multi-level cycles prevented by validation on update |

## User Stories

| #   | Story                                                                 | Summary                                                                                     | Status  | Parallelisable          |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ----------------------- |
| 01  | [us-01-items-locations-schema](us-01-items-locations-schema.md)       | Tables for items and locations with indexes, FK constraints, self-referential location tree | Partial | Yes                     |
| 02  | [us-02-connections-photos-schema](us-02-connections-photos-schema.md) | Tables for item_connections (with A<B dedup) and item_photos with indexes and cascades      | Done    | Yes                     |
| 03  | [us-03-items-locations-api](us-03-items-locations-api.md)             | CRUD procedures for items and locations                                                     | Done    | Blocked by us-01        |
| 04  | [us-04-connections-photos-api](us-04-connections-photos-api.md)       | Procedures for connections and photos                                                       | Partial | Blocked by us-01, us-02 |

US-01 and US-02 can run in parallel (independent tables). US-03 needs US-01. US-04 needs both US-01 and US-02.

## Out of Scope

- UI pages and components (PRD-044, PRD-045, PRD-046)
- Location tree management UI (Epic 02)
- Connection graph visualisation (Epic 03)
- Paperless-ngx integration (Epic 04)
- Warranty and value reporting (Epic 05)

## Drift Check

last checked: 2026-04-18
