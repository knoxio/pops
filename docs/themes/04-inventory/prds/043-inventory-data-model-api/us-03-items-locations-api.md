# US-03: Items and locations API

> PRD: [043 — Inventory Data Model & API](README.md)
> Status: Partial

## Description

As a developer, I want tRPC CRUD procedures for items and locations so that inventory data can be created, read, updated, and deleted via the API with proper filtering, pagination, and location tree traversal.

## Acceptance Criteria

- [x] `inventory.items.list` — paginated (limit/offset), filterable by search (name LIKE), type, locationId (with optional includeChildren for subtree), and condition; ordered by name ASC
- [ ] `inventory.items.list` with includeChildren=true returns items at the specified location and all descendant locations
- [x] `inventory.items.get` — returns single item by id with location breadcrumb array, connection count, and photo count; 404 if not found
- [x] `inventory.items.create` — requires name and type, validates assetId uniqueness if provided, sets createdAt/updatedAt, returns created item
- [x] `inventory.items.update` — partial update by id, updates only provided fields plus updatedAt; validates assetId uniqueness if changed
- [x] `inventory.items.delete` — removes item by id; FK cascade deletes connections and photos; 404 if not found
- [ ] `inventory.items.searchByAssetId` — exact match, case-insensitive; returns item or null
- [x] `inventory.locations.getTree` — returns full location tree as nested nodes with item count per location
- [ ] `inventory.locations.getPath` — returns breadcrumb array from root to specified location (ordered root-first)
- [x] `inventory.locations.create` — requires name; parentId is optional (null = root location)
- [x] `inventory.locations.update` — partial update: rename, move (change parentId), or reorder (change sortOrder)
- [x] `inventory.locations.delete` — cascades to child locations; items at deleted locations get locationId=NULL; force=true skips confirmation check
- [ ] `inventory.locations.getItems` — returns items at this location; includeChildren=true includes items from all descendant locations
- [x] Input validation on all procedures (zod schemas)
- [x] Pagination returns total count alongside data
- [ ] Tests cover CRUD operations, filtering, pagination, location tree construction, breadcrumb generation, cascade deletes, assetId uniqueness, and 404 cases

## Notes

The location tree can be built with a recursive CTE or by fetching all locations and building the tree in application code (the location table is small enough for either approach). The getTree procedure should include item counts — a LEFT JOIN with GROUP BY or a subquery per location. Items list filtering by locationId with includeChildren requires collecting all descendant location IDs first, then filtering items with `locationId IN (...)`.
