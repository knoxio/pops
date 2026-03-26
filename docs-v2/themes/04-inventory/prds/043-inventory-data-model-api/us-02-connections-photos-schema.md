# US-02: Connections and photos schema

> PRD: [043 — Inventory Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want the item_connections and item_photos tables with proper indexes and FK cascades so that items can be linked together bidirectionally and photos can be attached to items.

## Acceptance Criteria

- [x] `item_connections` table created with all columns per the data model (id, itemAId, itemBId, createdAt)
- [x] `item_connections.itemAId` is FK → items(id) ON DELETE CASCADE
- [x] `item_connections.itemBId` is FK → items(id) ON DELETE CASCADE
- [x] `item_connections` has a UNIQUE composite index on (itemAId + itemBId)
- [x] `item_connections` has an index on itemBId (for reverse lookups)
- [x] Application-level constraint: itemAId < itemBId is documented and enforced in API layer (not database) to prevent duplicate bidirectional entries
- [x] `item_photos` table created with all columns per the data model (id, itemId, filename, sortOrder, createdAt)
- [x] `item_photos.itemId` is FK → items(id) ON DELETE CASCADE
- [x] `item_photos.sortOrder` defaults to 0
- [x] `item_photos` has an index on itemId
- [x] Deleting an item cascades to all its connections and photos
- [x] Tests verify table creation, FK cascade behaviour (item delete removes connections and photos), unique constraint on (itemAId + itemBId), and index existence

## Notes

The A<B ordering constraint on item_connections is enforced at the application level, not the database level. This means the tRPC router must normalise the pair before inserting — swap the IDs if the caller passes them in the wrong order. The unique composite index then prevents true duplicates. Photo files are stored on disk at `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg` — the database only stores the filename.
