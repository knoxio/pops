# PRD-043: Inventory Data Model & API

> Epic: [00 — Schema & Data Model](../../epics/00-schema-data-model.md)
> Status: Done

## Overview

Define the inventory domain schema and build the tRPC routers that all other inventory features depend on. Five tables cover items with rich metadata (`home_inventory`), hierarchical locations, bidirectional item connections, photos, and document links. Items and locations use opaque TEXT UUIDs as PKs (consistent with the cross-domain UUID scheme used in finance entities and transactions); join/photo/document tables use auto-increment integer PKs.

## Data Model

### home_inventory

| Column                  | Type    | Constraints                              | Description                                               |
| ----------------------- | ------- | ---------------------------------------- | --------------------------------------------------------- |
| id                      | TEXT    | PK, default `lower(hex(randomblob(16)))` | Opaque UUID                                               |
| notion_id               | TEXT    | UNIQUE, nullable                         | Source of truth id from the legacy Notion DB              |
| item_name               | TEXT    | NOT NULL                                 | Item name                                                 |
| brand                   | TEXT    | nullable                                 | Manufacturer                                              |
| model                   | TEXT    | nullable                                 | Model number                                              |
| item_id                 | TEXT    | nullable                                 | Free-form supplier or manufacturer item identifier        |
| room                    | TEXT    | nullable                                 | Free-form room label (legacy)                             |
| location                | TEXT    | nullable                                 | Free-form location label (legacy)                         |
| type                    | TEXT    | nullable                                 | "electronics", "furniture", "appliance", etc.             |
| condition               | TEXT    | DEFAULT 'good'                           | "new", "good", "fair", "poor", "broken"                   |
| in_use                  | INTEGER | nullable                                 | Boolean flag (0/1) — currently in use                     |
| deductible              | INTEGER | nullable                                 | Boolean flag (0/1) — counted against insurance deductible |
| purchase_date           | TEXT    | nullable                                 | ISO date                                                  |
| warranty_expires        | TEXT    | nullable                                 | ISO date                                                  |
| replacement_value       | REAL    | nullable                                 | Current replacement cost                                  |
| resale_value            | REAL    | nullable                                 | Current resale value                                      |
| purchase_transaction_id | TEXT    | FK → transactions(id) ON DELETE SET NULL | Cross-domain link to the finance transaction              |
| purchased_from_id       | TEXT    | FK → entities(id) ON DELETE SET NULL     | Cross-domain link to the finance entity                   |
| purchased_from_name     | TEXT    | nullable                                 | Snapshot of supplier name at purchase time                |
| asset_id                | TEXT    | UNIQUE, nullable                         | Human-readable asset id (e.g., "HDMI01", "ROUTER01")      |
| notes                   | TEXT    | nullable                                 | Markdown text                                             |
| purchase_price          | REAL    | nullable                                 | Original cost                                             |
| location_id             | TEXT    | FK → locations(id) ON DELETE SET NULL    | Current structured location                               |
| last_edited_time        | TEXT    | NOT NULL                                 | ISO timestamp — wall-clock last edit                      |
| created_at              | TEXT    | NOT NULL DEFAULT `datetime('now')`       | ISO timestamp                                             |
| updated_at              | TEXT    | NOT NULL DEFAULT `datetime('now')`       | ISO timestamp                                             |

**Indexes:** asset_id (UNIQUE), item_name, location_id, type, warranty_expires

### locations

| Column           | Type    | Constraints                                    | Description                   |
| ---------------- | ------- | ---------------------------------------------- | ----------------------------- |
| id               | TEXT    | PK, default `lower(hex(randomblob(16)))`       | Opaque UUID                   |
| name             | TEXT    | NOT NULL                                       | Location name                 |
| parent_id        | TEXT    | FK → locations(id) ON DELETE CASCADE, nullable | Parent location (null = root) |
| sort_order       | INTEGER | NOT NULL DEFAULT 0                             | Display order among siblings  |
| last_edited_time | TEXT    | NOT NULL DEFAULT `datetime('now')`             | ISO timestamp                 |

**Indexes:** parent_id, (parent_id + sort_order)

### item_connections

| Column     | Type    | Constraints                               | Description               |
| ---------- | ------- | ----------------------------------------- | ------------------------- |
| id         | INTEGER | PK, AUTOINCREMENT                         |                           |
| item_a_id  | TEXT    | FK → home_inventory(id) ON DELETE CASCADE | First item (CHECK: a < b) |
| item_b_id  | TEXT    | FK → home_inventory(id) ON DELETE CASCADE | Second item               |
| created_at | TEXT    | NOT NULL DEFAULT `datetime('now')`        | ISO timestamp             |

**Indexes:** (item_a_id + item_b_id) UNIQUE, item_a_id, item_b_id

A `CHECK (item_a_id < item_b_id)` constraint plus the unique pair index enforce single-row representation: a connection (X, Y) and (Y, X) collapse to the lexicographically smaller ordering.

### item_photos

| Column     | Type    | Constraints                               | Description      |
| ---------- | ------- | ----------------------------------------- | ---------------- |
| id         | INTEGER | PK, AUTOINCREMENT                         |                  |
| item_id    | TEXT    | FK → home_inventory(id) ON DELETE CASCADE | Parent item      |
| file_path  | TEXT    | NOT NULL                                  | File path        |
| caption    | TEXT    | nullable                                  | Optional caption |
| sort_order | INTEGER | NOT NULL DEFAULT 0                        | Display order    |
| created_at | TEXT    | NOT NULL DEFAULT `datetime('now')`        | ISO timestamp    |

**Indexes:** item_id

Photo storage path: `{INVENTORY_IMAGES_DIR}/items/{item_id}/photo_NNN.jpg`

### item_documents

| Column                | Type    | Constraints                               | Description                     |
| --------------------- | ------- | ----------------------------------------- | ------------------------------- |
| id                    | INTEGER | PK, AUTOINCREMENT                         |                                 |
| item_id               | TEXT    | FK → home_inventory(id) ON DELETE CASCADE | Parent item                     |
| paperless_document_id | INTEGER | NOT NULL                                  | Paperless-ngx document id       |
| document_type         | TEXT    | NOT NULL                                  | "receipt", "warranty", "manual" |
| title                 | TEXT    | nullable                                  | Cached document title           |
| created_at            | TEXT    | NOT NULL DEFAULT `datetime('now')`        | ISO timestamp                   |

**Indexes:** (item_id + paperless_document_id) UNIQUE, item_id, paperless_document_id

`item_documents` belongs to PRD-049 (Paperless-ngx integration) but its schema lives alongside the rest of the inventory tables for FK locality.

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
| `trace`       | itemId, maxDepth? (10) | `{ data: ChainItem[] }`     | Recursive CTE, returns connected chain   |

### inventory.photos

| Procedure     | Input              | Output              | Notes                                                   |
| ------------- | ------------------ | ------------------- | ------------------------------------------------------- |
| `upload`      | itemId, file       | `{ data: Photo }`   | Multipart, compress (1920px max, HEIC→JPEG, strip EXIF) |
| `delete`      | id                 | `{ message }`       | Removes record + file from disk                         |
| `reorder`     | itemId, photoIds[] | `{ message }`       | Sets sort order based on array position                 |
| `listForItem` | itemId             | `{ data: Photo[] }` | Sorted by sortOrder ASC                                 |

## Business Rules

- Items and locations use opaque TEXT UUID PKs (matching the finance domain's UUID scheme); join/photo/document tables use auto-increment integer PKs (locality-only — they are never referenced cross-domain).
- Location deletion cascades to child locations but orphans items (location_id set to NULL via ON DELETE SET NULL)
- Two identical physical items get separate rows with different asset IDs (e.g., HDMI01, HDMI02)
- Asset IDs are human-readable, unique, and optional — not all items need one
- Warranty dates are fully optional; NULL means "no warranty"
- Location tree supports arbitrary depth and multiple roots (Home, Car, Storage Cage)
- Connection deduplication: enforce `itemAId < itemBId` at application level so (3,7) and (7,3) resolve to the same row
- Photo compression on upload: resize to 1920px max dimension, convert HEIC to JPEG, strip EXIF metadata
- `trace` uses a recursive CTE with configurable max depth (default 10) to prevent infinite loops

## Edge Cases

| Case                                            | Behaviour                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Duplicate assetId on create/update              | Unique constraint error — return validation error                                                |
| Delete location with children                   | CASCADE deletes all descendant locations; items at those locations get locationId=NULL           |
| Delete item with connections                    | FK CASCADE removes connection rows                                                               |
| Delete item with photos                         | FK CASCADE removes photo records; application deletes files from disk                            |
| Connect item to itself                          | Validation error (itemAId must differ from itemBId)                                              |
| Duplicate connection (3,7) when (7,3) requested | Application normalises to (3,7); unique constraint catches duplicates                            |
| trace hits max depth                            | Stops recursion, returns chain up to that depth                                                  |
| searchByAssetId with no match                   | Returns null                                                                                     |
| Location tree with circular parentId            | Self-referential FK prevents direct cycles; multi-level cycles prevented by validation on update |

## User Stories

| #   | Story                                                                 | Summary                                                                                     | Status | Parallelisable          |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| 01  | [us-01-items-locations-schema](us-01-items-locations-schema.md)       | Tables for items and locations with indexes, FK constraints, self-referential location tree | Done   | Yes                     |
| 02  | [us-02-connections-photos-schema](us-02-connections-photos-schema.md) | Tables for item_connections (with A<B dedup) and item_photos with indexes and cascades      | Done   | Yes                     |
| 03  | [us-03-items-locations-api](us-03-items-locations-api.md)             | CRUD procedures for items and locations                                                     | Done   | Blocked by us-01        |
| 04  | [us-04-connections-photos-api](us-04-connections-photos-api.md)       | Procedures for connections and photos                                                       | Done   | Blocked by us-01, us-02 |

US-01 and US-02 can run in parallel (independent tables). US-03 needs US-01. US-04 needs both US-01 and US-02.

## Out of Scope

- UI pages and components (PRD-044, PRD-045, PRD-046)
- Location tree management UI (Epic 02)
- Connection graph visualisation (Epic 03)
- Paperless-ngx integration (Epic 04)
- Warranty and value reporting (Epic 05)

## Drift Check

last checked: 2026-04-18
