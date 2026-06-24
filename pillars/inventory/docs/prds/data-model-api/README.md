# Inventory Data Model & API

> Status: Partial — core schema + REST for items, locations, connections and photos are live. Two gaps are tracked as ideas, not requirements: the `items.get` aggregate enrichment (location breadcrumb + connection/photo counts on the item payload) is NOT built — see [ideas/item-get-aggregate.md](../../ideas/item-get-aggregate.md); and `DELETE /locations/:id` only removes a single row (no recursive descendant-location cleanup) — see [ideas/location-delete-cascade.md](../../ideas/location-delete-cascade.md).

The inventory pillar owns its own SQLite DB and serves the items / locations / connections / photos surface of the ts-rest contract (`src/contract/rest-items.ts`, `rest-locations.ts`, `rest-connections.ts`, `rest-photos.ts`). These four tables and their endpoints are the foundation every other inventory feature (fixtures, documents, paperless, reports, search) builds on. Document/paperless tables and reporting live in their own PRDs; only items, locations, connections and photos are in scope here.

## Data Model

All four tables live in the inventory pillar's own SQLite DB. Items and locations use opaque TEXT UUID PKs (`crypto.randomUUID()`); the join/photo tables use auto-increment integer PKs (locality-only, never referenced cross-pillar).

### home_inventory

UUID PK `id`. Core columns: `item_name` (NOT NULL), `brand`, `model`, `item_id` (free-form supplier id), `room`, `location` (legacy free-form labels), `type`, `condition` (DEFAULT `'good'`), `in_use`/`deductible` (INTEGER 0/1 booleans), `purchase_date`, `warranty_expires`, `replacement_value`/`resale_value`/`purchase_price` (REAL), `purchased_from_name`, `asset_id`, `notes`. Structured location via `location_id` → `locations(id)` ON DELETE SET NULL. Timestamps `created_at`/`updated_at`/`last_edited_time` (all NOT NULL, the first two default `datetime('now')`).

Cross-pillar links are **soft URI references** resolved only by the nightly reconciliation cron, never at read time:

- `purchase_transaction_uri` — `pops://finance/transaction/<id>`, with `purchase_transaction_stale_at` set by the cron when the target 404s (row is kept, consumers branch on the stale marker rather than delete).
- `owner_uri` — `pops://core/user/<email>`, with `owner_stale_at` (same semantics).
- Legacy `purchase_transaction_id` / `purchased_from_id` remain as plain TEXT for backfill.

Indexes: `asset_id` (UNIQUE, via explicit `idx_inventory_asset_id` — no second `.unique()` index), `item_name`, `location_id`, `type`, `warranty_expires`, `purchase_transaction_uri`, `owner_uri`.

### locations

UUID PK `id`. `name` (NOT NULL), `parent_id` (plain nullable TEXT self-reference — adjacency-list pointer, **not** a DB foreign key; null = root), `sort_order` (NOT NULL DEFAULT 0), `last_edited_time` (NOT NULL). Adjacency-list tree, arbitrary depth, multiple roots. Parent integrity (existence, cycle, self-parent) is enforced in the service layer, not by an FK. Indexes: `parent_id`, `name`, `(parent_id, sort_order)`.

### item_connections

Integer AUTOINCREMENT PK. `item_a_id` / `item_b_id` both FK → `home_inventory(id)` ON DELETE CASCADE, `created_at`. A `CHECK (item_a_id < item_b_id)` constraint **plus** a `UNIQUE(item_a_id, item_b_id)` index collapse `(X,Y)` and `(Y,X)` to one canonical row. Indexes: the unique pair, `item_a_id`, `item_b_id`.

### item_photos

Integer AUTOINCREMENT PK. `item_id` FK → `home_inventory(id)` ON DELETE CASCADE, `file_path` (NOT NULL, relative), `caption`, `sort_order` (NOT NULL DEFAULT 0), `created_at`. Index on `item_id`. Files stored at `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg`; DB stores the relative path.

## REST API Surface

### Items (`/items`)

- `GET /items` — list with filters (`search` name LIKE, `room`, `type`, `condition`, `inUse`, `deductible`, `locationId` + `includeChildren` subtree), `limit`/`offset` pagination. Returns `{ data, pagination, totals }` where `totals` = `{ totalReplacementValue, totalResaleValue }`.
- `GET /items/search/by-asset-id?assetId=` — exact, case-insensitive; `{ data: Item | null }`.
- `GET /items/stats/count-by-asset-prefix?prefix=` — count of asset ids with that prefix (case-insensitive).
- `GET /items/stats/distinct-types` — distinct non-null types.
- `GET /items/:id` — single item, 404 if absent. (Returns the raw item row; no breadcrumb/count enrichment — that is an idea.)
- `POST /items` → 201, validates `assetId` uniqueness.
- `PATCH /items/:id` — partial update.
- `DELETE /items/:id` — FK cascade removes connections and photos.

The 3-segment `/items/search/...` and `/items/stats/...` paths are registered ahead of `/items/:id` so the param route never shadows them.

### Locations (`/locations`)

- `GET /locations` — flat list `{ data, total }`.
- `GET /locations/tree` — nested tree (declared before `/locations/:id` to avoid shadowing).
- `GET /locations/:id` — single location, 404 if absent.
- `GET /locations/:id/path` — root → location ancestor chain (breadcrumbs).
- `GET /locations/:id/children` — direct children.
- `GET /locations/:id/delete-stats` — `{ childCount, descendantCount, itemCount, totalItemCount }`.
- `POST /locations` → 201 (`parentId` optional, null = root).
- `PATCH /locations/:id` — rename / move (`parentId`) / reorder (`sortOrder`).
- `DELETE /locations/:id?force=` — without `force`, when the location has children or items returns `{ requiresConfirmation: true, stats }` instead of deleting; with `force` (or when empty) it deletes the single row. Items pointing directly at that row get `location_id = NULL` via the `home_inventory.location_id` FK (`ON DELETE SET NULL`). Descendant location rows are **not** cascaded — they are left in place with a now-dangling `parent_id` (no FK on `parent_id`), and their items keep their `location_id`. (Recursive descendant cleanup is not built; see [ideas/location-delete-cascade.md](../../ideas/location-delete-cascade.md).)

### Connections (`/connections`, `/items/:itemId/connections`)

- `POST /connections` `{ itemAId, itemBId }` → 201. Normalises A<B server-side, rejects self-connection (409) and duplicate pair.
- `DELETE /connections?itemAId=&itemBId=` — order-normalised delete.
- `GET /items/:itemId/connections` — paginated edge list.
- `GET /items/:itemId/connections/trace?maxDepth=` — connection chain as a tree (BFS, default + max depth 10, cycle-safe via visited set).
- `GET /items/:itemId/connections/graph?maxDepth=` — subgraph as `{ nodes, edges }`.

### Photos (`/items/:itemId/photos`, `/photos/:id`)

- `POST /items/:itemId/photos` `{ fileBase64, caption?, sortOrder? }` → 201. Decodes base64, runs the sharp pipeline (auto-rotate, resize to fit 1920×1920 without enlargement, JPEG q85, EXIF stripped), writes the next sequential `photo_NNN.jpg`, inserts the row. Upload is base64-in-JSON, not multipart.
- `POST /items/:itemId/photos/attach` `{ filePath, caption?, sortOrder? }` — attach an already-stored relative path (rejects `..` / absolute paths).
- `GET /items/:itemId/photos` — paginated, sorted by `sortOrder` ASC.
- `PATCH /items/:itemId/photos/reorder` `{ orderedIds }` — sets `sort_order` by array position, returns the reordered list.
- `DELETE /photos/:id` — removes the row and the file from disk; 404 if absent.
- `PATCH /photos/:id` `{ caption?, sortOrder? }` — edit a single photo.

## Business Rules

- Items/locations use TEXT UUID PKs; connection/photo PKs are integer (locality only).
- Deleting a location removes only that row. Items pointing directly at it are **orphaned** (`location_id` → NULL via the items-table FK), never deleted. Descendant location rows are not cascaded (there is no FK on `parent_id`).
- Two identical physical items are separate rows with distinct asset ids (HDMI01, HDMI02). Asset ids are human-readable, unique, and optional.
- Warranty/value fields are all optional; NULL = "no warranty / unknown value".
- Connection dedup is enforced both at the application layer (normalise A<B before insert) and at the DB layer (CHECK + UNIQUE pair).
- Photo compression on upload: auto-rotate, fit within 1920×1920 (preserve aspect, no enlargement), JPEG q85, strip EXIF for privacy.
- `trace`/`graph` traverse both connection directions, cap at `maxDepth` (default/max 10), and use a visited set so cycles never recurse infinitely.
- Cross-pillar finance/owner references are soft URIs reconciled by cron, not FK-enforced and not resolved at read time.

## Edge Cases

| Case                                               | Behaviour                                                                                                                                          |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate `assetId` on create/update               | Validation error (unique index)                                                                                                                    |
| Delete location (with `force`)                     | Single-row delete; items directly in it get `locationId = NULL` (FK). Descendant location rows are left untouched (no `parent_id` FK / no cascade) |
| Delete non-empty location without `force`          | Returns `{ requiresConfirmation, stats }`, no deletion                                                                                             |
| Delete item with connections/photos                | FK cascade removes rows; photo files deleted from disk                                                                                             |
| Connect item to itself                             | 409 conflict                                                                                                                                       |
| Duplicate connection `(3,7)` vs `(7,3)`            | Normalised to `(3,7)`; CHECK + UNIQUE reject the duplicate                                                                                         |
| `trace`/`graph` hit maxDepth or a cycle            | Stop at depth / skip visited nodes, return partial chain                                                                                           |
| `searchByAssetId` no match                         | `{ data: null }`                                                                                                                                   |
| Photo upload to new item                           | Creates `{itemId}` dir; filenames sequential `photo_001.jpg`…                                                                                      |
| Photo `attach`/`update` with `..` or absolute path | Validation error                                                                                                                                   |

## Acceptance Criteria

Schema:

- [x] `home_inventory` UUID PK; `condition` defaults `'good'`; `location_id` FK ON DELETE SET NULL; unique `asset_id` index plus `item_name`/`location_id`/`type`/`warranty_expires` indexes.
- [x] `in_use`/`deductible` stored as INTEGER booleans and surfaced as `boolean` in the contract.
- [x] Soft cross-pillar URIs (`purchase_transaction_uri`, `owner_uri`) with stale markers and dedicated indexes; resolution deferred to the nightly cron.
- [x] `locations` `parent_id` plain nullable TEXT adjacency pointer (no DB FK; parent integrity enforced in the service layer), multiple roots, `sort_order` default 0; indexes on `parent_id`, `name`, `(parent_id, sort_order)`.
- [x] `item_connections` both FKs ON DELETE CASCADE, `CHECK(item_a_id < item_b_id)` + `UNIQUE(item_a_id, item_b_id)`, indexes on each id.
- [x] `item_photos` FK ON DELETE CASCADE, `sort_order` default 0, index on `item_id`; files at `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg`.

API:

- [x] Items list filters/paginates and returns `pagination` + value `totals`.
- [x] Items get/create/update/delete with assetId-uniqueness validation, 404s, and FK-cascade delete.
- [x] `searchByAssetId`, `countByAssetPrefix`, `distinctTypes` helpers.
- [x] Locations `list`/`tree`/`get`/`path`/`children`/`delete-stats`/`create`/`update`/`delete`, with the non-empty-delete confirmation handshake and single-row delete (direct items orphaned via FK). Recursive descendant-location cleanup is not built — see [ideas/location-delete-cascade.md](../../ideas/location-delete-cascade.md).
- [x] Connections `connect`/`disconnect` (A<B normalised, self-connection 409, duplicate rejected), `listForItem`, `trace` (tree), `graph` (nodes+edges), depth-capped and cycle-safe.
- [x] Photos `upload` (base64 + sharp compression), `attach`, `listForItem`, `reorder`, `remove` (row+file), `update`; path-traversal guarded.
- [ ] `items.get` does NOT return location breadcrumb / connection count / photo count — see idea.
