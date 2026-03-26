# US-04: Connections and photos API

> PRD: [043 — Inventory Data Model & API](README.md)
> Status: Partial — photos.attach takes file path string (no upload/compression/HEIC); disconnect takes connection ID not item pair

## Description

As a developer, I want tRPC procedures for item connections and photos so that items can be linked together bidirectionally with chain tracing, and photos can be uploaded, compressed, reordered, and deleted.

## Acceptance Criteria

- [x] `inventory.connections.connect` — accepts two item IDs, normalises ordering (enforces A<B), inserts connection; returns error if items are the same or connection already exists
- [ ] `inventory.connections.disconnect` — accepts two item IDs, normalises ordering, deletes the connection row
- [x] `inventory.connections.listForItem` — accepts an item ID, returns all connected items by querying both itemAId and itemBId sides
- [x] `inventory.connections.traceChain` — accepts an item ID and optional maxDepth (default 10), uses a recursive CTE to traverse the connection graph, returns the full chain of connected items with depth info
- [x] `traceChain` stops recursion at maxDepth to prevent runaway queries
- [x] `traceChain` handles cycles in the connection graph without infinite recursion
- [ ] `inventory.photos.upload` — accepts itemId and file (multipart), compresses image (1920px max dimension, HEIC→JPEG conversion, strip EXIF metadata), stores file at `{INVENTORY_IMAGES_DIR}/items/{itemId}/photo_NNN.jpg`, creates database record
- [x] `inventory.photos.delete` — removes the database record and deletes the file from disk; 404 if not found
- [x] `inventory.photos.reorder` — accepts itemId and ordered array of photoIds, sets sortOrder based on array position
- [x] `inventory.photos.listForItem` — returns all photos for an item, sorted by sortOrder ASC
- [ ] Photo upload creates the item's directory if it does not exist
- [ ] Photo filenames are sequential within an item's directory (photo_001.jpg, photo_002.jpg, etc.)
- [ ] Tests cover: connect/disconnect with A<B normalisation, duplicate connection rejection, self-connection rejection, listForItem queries both sides, traceChain recursive traversal, traceChain max depth limit, photo upload with compression, photo delete (record + file), photo reorder

## Notes

The recursive CTE for traceChain works by starting from the given item and following connections in both directions (since connections are bidirectional). Use a visited-items set in the CTE to avoid revisiting nodes and handle cycles. Photo compression should use sharp or a similar library — resize to fit within a 1920x1920 bounding box (preserve aspect ratio), convert HEIC/HEIF to JPEG, and strip all EXIF metadata for privacy.
