# PRD-017: Inventory Schema Upgrade & Migration

**Epic:** [00 — Schema Upgrade & Migration](../themes/inventory/epics/00-schema-upgrade.md)
**Theme:** Inventory
**Status:** Draft
**ADRs:** [011 — Drizzle ORM](../architecture/adr-011-drizzle-orm.md)

## Problem Statement

The current `home_inventory` table is a flat structure with text fields for room and location, no item relationships, no photo support, no asset IDs, and no notes. The inventory theme requires hierarchical locations, bidirectional item connections, photo attachments, and searchable asset identifiers. The existing table must be migrated to Drizzle and extended with new tables while preserving the 5 existing seeded records.

## Goal

A Drizzle-based schema with four tables: `inventory_items` (upgraded), `locations` (self-referential tree), `item_connections` (bidirectional junction), and `item_photos` (photo references). tRPC routers for all CRUD operations. Seed data with a realistic location tree and item connections.

## Requirements

### R1: Locations Table

```typescript
export const locations = sqliteTable('locations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentId: integer('parent_id').references((): AnySQLiteColumn => locations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_locations_parent').on(table.parentId),
]);
```

- Self-referential: `parent_id` FK to `locations.id`
- Root locations have `parent_id = NULL` (Home, Car, Storage Cage, etc.)
- Arbitrary depth: Home → Bedroom → Wardrobe → Right Door → Second Drawer
- `ON DELETE CASCADE`: deleting a location deletes all children (and orphans items — handled in application layer)
- `sort_order` for manual ordering within a level
- URI: `pops:inventory/location/{id}`

### R2: Inventory Items Table (upgraded)

```typescript
export const inventoryItems = sqliteTable('inventory_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assetId: text('asset_id').unique(),
  name: text('name').notNull(),
  brand: text('brand'),
  model: text('model'),
  type: text('type', { enum: ['Cable', 'Appliance', 'Clothing', 'Plant', 'Furniture', 'Electronics', 'Kitchenware', 'Tool', 'Decor'] }),
  condition: text('condition', { enum: ['New', 'Excellent', 'Good', 'Fair', 'Poor'] }),
  locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
  inUse: integer('in_use').notNull().default(0),
  deductible: integer('deductible').notNull().default(0),
  purchaseDate: text('purchase_date'),
  warrantyExpires: text('warranty_expires'),
  replacementValue: real('replacement_value'),
  resaleValue: real('resale_value'),
  purchaseTransactionId: text('purchase_transaction_id'),
  purchasedFromId: text('purchased_from_id'),
  purchasedFromName: text('purchased_from_name'),
  notes: text('notes'),
  notionId: text('notion_id').unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_inventory_items_asset_id').on(table.assetId),
  index('idx_inventory_items_name').on(table.name),
  index('idx_inventory_items_location').on(table.locationId),
  index('idx_inventory_items_type').on(table.type),
]);
```

**Changes from current `home_inventory`:**

| Field | Before | After |
|-------|--------|-------|
| `id` | UUID text | Auto-increment integer |
| `asset_id` | `userDefined:ID` text (no index) | Unique, indexed, searchable |
| `room` | Text select | Removed — replaced by `location_id` |
| `location` | Text select | Removed — replaced by `location_id` |
| `location_id` | — | FK to `locations` table |
| `notes` | — | Free-form markdown text |
| `item_id` | Text field for product IDs | Removed — `model` covers this. `asset_id` is the POPS identifier |
| `last_edited_time` | Notion sync artifact | Replaced by `updated_at` |

- `ON DELETE SET NULL` for location: deleting a location sets items to `location_id = NULL` (unlocated), doesn't delete items
- `notion_id` preserved for migration tracking (can be dropped after Notion cutover is complete)
- `asset_id` is optional but unique when set — not every item needs a physical tag
- `type` and `condition` are enums matching the Notion values
- URI: `pops:inventory/item/{id}`

### R3: Item Connections Table

```typescript
export const itemConnections = sqliteTable('item_connections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemAId: integer('item_a_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  itemBId: integer('item_b_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique().on(table.itemAId, table.itemBId),
  index('idx_item_connections_a').on(table.itemAId),
  index('idx_item_connections_b').on(table.itemBId),
]);
```

- **Bidirectional:** one row represents a connection in both directions
- **Deduplication:** application layer enforces `item_a_id < item_b_id` before insert. The unique constraint prevents duplicates regardless.
- **Cascade:** deleting an item removes all its connections
- No connection type — the item's metadata (Type, name) carries the semantic meaning
- URI: `pops:inventory/connection/{id}`

### R4: Item Photos Table

```typescript
export const itemPhotos = sqliteTable('item_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => inventoryItems.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  caption: text('caption'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_item_photos_item').on(table.itemId),
]);
```

- `file_path` is relative to the inventory images directory (e.g., `items/{item_id}/photo_001.jpg`)
- Photos are served via an Express endpoint similar to media images (see PRD-008 R7)
- `sort_order` for manual ordering (first photo = primary/thumbnail)
- `caption` is optional descriptive text
- Cascade: deleting an item deletes photo records (file cleanup handled in application layer)

**Photo storage:**
```
{INVENTORY_IMAGES_DIR}/
  items/{item_id}/
    photo_001.jpg
    photo_002.jpg
    ...
```

Environment variable: `INVENTORY_IMAGES_DIR` (default: `/data/inventory/images`)

### R5: Migration from Existing Schema

The existing `home_inventory` table must be migrated to the new schema without data loss.

**Migration steps:**
1. Create `locations` table
2. Create new `inventory_items` table with the upgraded schema
3. Create `item_connections` and `item_photos` tables
4. Migrate existing data:
   - For each unique `room` value in the old table, create a root location under "Home"
   - For each unique `room + location` combination, create a child location
   - Map old items to new schema: copy all fields, set `location_id` from the created locations, rename `item_id` content to `asset_id`
5. Drop old `home_inventory` table (or rename to `home_inventory_legacy` for safety)

This migration is Drizzle-generated for the structural changes, with a custom data migration script for the data mapping.

### R6: tRPC Router — Locations

**inventory.locations:**

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `getTree` | query | `{}` | `LocationNode[]` (recursive) | Full location tree |
| `getById` | query | `{ id }` | `Location \| null` | Single location with parent path |
| `create` | mutation | `{ name, parentId? }` | `Location` | Create location (root if no parentId) |
| `update` | mutation | `{ id, name?, parentId?, sortOrder? }` | `Location` | Rename, move, or reorder |
| `delete` | mutation | `{ id }` | `void` | Delete location and children. Fails if items would be orphaned (unless `force: true` which sets them to null) |
| `getItems` | query | `{ id, includeChildren? }` | `InventoryItem[]` | Items at this location (optionally including sub-locations) |
| `getPath` | query | `{ id }` | `Location[]` | Breadcrumb path from root to this location |

**`LocationNode` type (recursive):**
```typescript
interface LocationNode {
  id: number;
  name: string;
  sortOrder: number;
  itemCount: number;
  children: LocationNode[];
}
```

### R7: tRPC Router — Item Connections

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `connect` | mutation | `{ itemAId, itemBId }` | `ItemConnection` | Create bidirectional connection |
| `disconnect` | mutation | `{ itemAId, itemBId }` | `void` | Remove connection |
| `listForItem` | query | `{ itemId }` | `InventoryItem[]` | All items connected to this item |
| `traceChain` | query | `{ itemId, maxDepth? }` | `ConnectionNode[]` | Recursive chain traversal |

**`traceChain` implementation:**
```sql
WITH RECURSIVE chain AS (
  SELECT item_b_id AS connected_id, 1 AS depth
  FROM item_connections WHERE item_a_id = ?
  UNION
  SELECT item_a_id AS connected_id, 1 AS depth
  FROM item_connections WHERE item_b_id = ?
  UNION ALL
  SELECT
    CASE WHEN ic.item_a_id = chain.connected_id THEN ic.item_b_id ELSE ic.item_a_id END,
    chain.depth + 1
  FROM item_connections ic
  JOIN chain ON ic.item_a_id = chain.connected_id OR ic.item_b_id = chain.connected_id
  WHERE chain.depth < ?
)
SELECT DISTINCT connected_id, depth FROM chain;
```

Uses Drizzle's `sql` template for the recursive CTE. Max depth defaults to 10.

### R8: tRPC Router — Item Photos

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `upload` | mutation | `{ itemId, file }` | `ItemPhoto` | Upload and attach photo |
| `delete` | mutation | `{ id }` | `void` | Delete photo (record + file) |
| `reorder` | mutation | `{ itemId, photoIds: number[] }` | `void` | Set sort order |
| `listForItem` | query | `{ itemId }` | `ItemPhoto[]` | Photos for an item, sorted |

**Upload flow:**
1. Receive file via multipart form upload (Express middleware, not tRPC — binary data)
2. Validate: image type (JPEG, PNG, HEIC), max size (10 MB)
3. Compress: resize to max 1920px width, convert HEIC to JPEG, strip EXIF (privacy)
4. Store in `{INVENTORY_IMAGES_DIR}/items/{item_id}/photo_{NNN}.jpg`
5. Create `item_photos` row
6. Return photo record

**Image serving:** `GET /inventory/images/:itemId/:filename` — same pattern as media images, with cache headers.

### R9: Updated Items Router

Extend the existing `inventory.items` tRPC router with new fields:

**Updated procedures:**

| Change | Details |
|--------|---------|
| `create` input | Add: `assetId`, `locationId`, `notes` |
| `update` input | Add: `assetId`, `locationId`, `notes` |
| `list` filters | Add: `locationId` (with optional `includeChildren`), `assetId` (exact match), search by asset ID or name |
| `get` response | Include: location breadcrumb, connection count, photo count |
| `delete` | Also clean up: connections (cascaded), photos (cascade + file delete) |

**New procedure:**

| Procedure | Type | Input | Output | Description |
|-----------|------|-------|--------|-------------|
| `searchByAssetId` | query | `{ assetId: string }` | `InventoryItem \| null` | Quick lookup by asset tag |

### R10: Seed Data

Update `mise db:seed` with:

**Location tree:**
```
Home
├── Living Room
│   ├── TV Unit
│   │   ├── Left Door
│   │   ├── Right Drawer
│   │   └── Left Drawer
│   └── Bar
├── Bedroom
│   └── Wardrobe Right Door
├── Kitchen
│   └── Counter
├── Office
│   └── Desk
└── Main Balcony

Car
Storage Cage
```

**Items (15+):**
- 5 existing items migrated to new schema with locations
- 10+ new items with asset IDs covering: electronics (router, switch, server), cables (HDMI, ethernet, power), appliances (wine fridge, coffee machine), infrastructure (power boards, wall plugs)

**Connections (10+):**
- Wall power plug → Power Board PB01
- PB01 → Power supply PS001, PS002, PS003
- PS001 → Router ROUTER01
- ROUTER01 → ETHER01, ETHER02, ETHER03
- Wall ethernet plug ETH04-BED → ETH04-LVG (cross-room)
- HDMI cable HDMI01 → TV

**Photos:** 2-3 sample photos for seeded items (can use placeholder images)

## Out of Scope

- Notion import (PRD-018)
- UI pages or components (PRD-019, PRD-020)
- Graph visualisation (PRD-021)
- Paperless-ngx integration (PRD-022)
- Value reporting (PRD-023)

## Acceptance Criteria

1. `locations` table supports arbitrary-depth tree with multiple roots
2. `inventory_items` table has all new fields (asset_id, location_id, notes)
3. `item_connections` table enforces bidirectional uniqueness
4. `item_photos` table supports multiple photos per item with ordering
5. Existing 5 seed items migrate to the new schema with correct location mappings
6. `asset_id` is unique and indexed — searching by asset ID is fast
7. Location `ON DELETE CASCADE` removes children, `ON DELETE SET NULL` for item location
8. Connection `ON DELETE CASCADE` removes connections when an item is deleted
9. Photo `ON DELETE CASCADE` removes photo records (file cleanup in application layer)
10. Recursive chain traversal works via `traceChain` procedure
11. All tRPC procedures have zod input validation
12. Unit tests cover: location tree CRUD, connection dedup logic, chain traversal, photo CRUD
13. Seed data includes location tree, 15+ items, 10+ connections
14. `pnpm typecheck` and `pnpm test` pass

## Edge Cases & Decisions

**Q: What happens when a location with items is deleted?**
A: Items at that location have `location_id` set to NULL (unlocated). The UI should show "No location" for these items. The delete procedure warns the user and requires confirmation (or `force: true`).

**Q: Can two items have the same asset_id?**
A: No. `asset_id` has a UNIQUE constraint. If you have two identical HDMI cables, they're HDMI01 and HDMI02.

**Q: What about the connection dedup (A < B)?**
A: The service layer normalises before insert: `const [a, b] = itemAId < itemBId ? [itemAId, itemBId] : [itemBId, itemAId]`. The unique constraint on `(item_a_id, item_b_id)` is the safety net. When querying connections for an item, check both columns: `WHERE item_a_id = ? OR item_b_id = ?`.

**Q: Why does inventory use integer PKs while finance uses UUID text PKs?**
A: The existing finance tables use UUID text IDs (legacy from Notion import). New tables use auto-increment integers (cleaner, faster, standard). Cross-domain FKs (`purchase_transaction_id`, `purchased_from_id`) remain TEXT to reference the finance tables' UUID PKs. This mixed pattern is intentional and will be resolved when finance tables are migrated to integer PKs in a future cleanup.

**Q: How is `updated_at` maintained?**
A: Application-level — Drizzle `.set({ updatedAt: sql\`datetime('now')\` })` on every update.

**Q: What about the existing `home_inventory` table name?**
A: Rename to `inventory_items` during migration. The table name should reflect the domain, not the legacy naming.

## User Stories

> **Standard verification — applies to every US below.**

### US-1: Create Drizzle schema files
**As a** developer, **I want** all inventory tables defined as Drizzle schemas **so that** types and DDL are a single source of truth.

**Acceptance criteria:**
- Schema files for: inventory_items, locations, item_connections, item_photos
- `drizzle-kit generate` produces migration SQL
- Migrations run on fresh and existing databases

### US-2: Migrate existing data
**As a** developer, **I want** existing inventory data preserved during the schema upgrade **so that** no data is lost.

**Acceptance criteria:**
- Location tree created from existing room/location values
- Existing items mapped to new schema with correct location_id
- Old table removed or renamed after verification

### US-3: Locations tRPC router
**As a** developer, **I want** CRUD procedures for the location tree **so that** the UI can manage locations.

**Acceptance criteria:**
- Full tree retrieval with item counts
- Create/update/delete with cascade behaviour
- Breadcrumb path query
- Items-at-location query with optional children inclusion
- Unit tests for tree operations

### US-4: Connections tRPC router
**As a** developer, **I want** procedures for managing item connections **so that** the UI can connect and disconnect items.

**Acceptance criteria:**
- Connect/disconnect with dedup normalisation
- List connections for an item
- Recursive chain traversal with depth limit
- Unit tests including circular connection handling

### US-5: Photos tRPC router
**As a** developer, **I want** procedures for managing item photos **so that** the UI can upload and display photos.

**Acceptance criteria:**
- Upload with compression (resize, HEIC→JPEG, EXIF strip)
- Delete removes file and record
- Reorder updates sort_order
- Image serving endpoint with cache headers
- Unit tests for upload validation

### US-6: Updated items router
**As a** developer, **I want** the items router extended with new fields **so that** asset IDs, locations, notes, and search work.

**Acceptance criteria:**
- Create/update accept asset_id, location_id, notes
- List filterable by location (with children option)
- Search by asset ID (exact match)
- Get includes location breadcrumb, connection count, photo count
- Delete cleans up connections and photo files

### US-7: Seed data
**As a** developer, **I want** realistic seed data **so that** E2E tests have a meaningful dataset.

**Acceptance criteria:**
- Location tree with 4+ rooms and sub-locations
- 15+ items with asset IDs across locations
- 10+ connections forming at least one chain (wall → power board → devices)
- 2-3 photos on select items
- Idempotent seeding
