# US-01: Items and locations schema

> PRD: [043 — Inventory Data Model & API](README.md)
> Status: Partial — missing purchasePrice column, condition default, createdAt/updatedAt, composite parentId+sortOrder index; table named home_inventory not items

## Description

As a developer, I want the items and locations tables with proper indexes, FK constraints, and self-referential location hierarchy so that inventory items can be stored with enforced location relationships.

## Acceptance Criteria

- [ ] `items` table created with all columns per the data model (id, name, type, brand, model, assetId, locationId, condition, purchaseDate, purchasePrice, replacementValue, resaleValue, warrantyExpiry, notes, purchaseTransactionId, purchasedFromId, createdAt, updatedAt)
- [ ] `items.condition` defaults to 'good'
- [x] `items.locationId` is FK → locations(id) ON DELETE SET NULL — deleting a location orphans items instead of deleting them
- [x] `items.purchaseTransactionId` and `items.purchasedFromId` are TEXT (UUID format for cross-domain finance FKs)
- [ ] `items` indexes on: assetId (UNIQUE), locationId, type, name, warrantyExpiry
- [x] `locations` table created with all columns per the data model (id, name, parentId, sortOrder, createdAt)
- [x] `locations.parentId` is FK → locations(id) ON DELETE CASCADE — deleting a location cascades to all descendant locations
- [x] `locations.parentId` nullable (null = root location)
- [x] `locations.sortOrder` defaults to 0
- [ ] `locations` indexes on: parentId, (parentId + sortOrder) composite
- [x] Multiple root locations are supported (parentId=NULL for "Home", "Car", "Storage Cage")
- [x] Deleting a location cascades to child locations but sets locationId=NULL on items at those locations
- [ ] Tests verify table creation, FK cascade behaviour (location delete orphans items), unique constraint on assetId, and index existence

## Notes

The items table uses integer auto-increment PKs. Cross-domain FKs to the finance domain (purchaseTransactionId, purchasedFromId) are TEXT UUIDs — these are not enforced at the database level since they reference a different domain. The location tree is a standard adjacency list model with self-referential parentId.
