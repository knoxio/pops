# US-01: Items and locations schema

> PRD: [043 — Inventory Data Model & API](README.md)
> Status: Done

## Description

As a developer, I want the items and locations tables with proper indexes, FK constraints, and self-referential location hierarchy so that inventory items can be stored with enforced location relationships.

## Acceptance Criteria

- [x] `items` table created with all columns per the data model — implemented as `home_inventory` (legacy name retained for Notion-import compatibility); columns present: id (TEXT UUID PK), item_name, type, brand, model, asset_id, location_id, condition, purchase_date, purchase_price, replacement_value, resale_value, warranty_expires, notes, purchase_transaction_id, purchased_from_id, created_at, updated_at
- [x] `items.condition` defaults to 'good'
- [x] `items.locationId` is FK → locations(id) ON DELETE SET NULL — deleting a location orphans items instead of deleting them
- [x] `items.purchaseTransactionId` and `items.purchasedFromId` are TEXT (UUID format for cross-domain finance FKs)
- [x] `items` indexes on: assetId (UNIQUE), locationId, type, name, warrantyExpiry
- [x] `locations` table created with all columns per the data model (id, name, parentId, sortOrder, createdAt)
- [x] `locations.parentId` is FK → locations(id) ON DELETE CASCADE — deleting a location cascades to all descendant locations
- [x] `locations.parentId` nullable (null = root location)
- [x] `locations.sortOrder` defaults to 0
- [x] `locations` indexes on: parentId, (parentId + sortOrder) composite
- [x] Multiple root locations are supported (parentId=NULL for "Home", "Car", "Storage Cage")
- [x] Deleting a location cascades to child locations but sets locationId=NULL on items at those locations
- [x] Tests verify table creation, FK cascade behaviour (location delete orphans items), unique constraint on assetId, and index existence — see `items/schema.test.ts`

## Notes

The table is named `home_inventory` (not `items`) and uses a TEXT UUID PK (not integer auto-increment) — both retained for Notion import backwards-compatibility. The PRD spec described the idealised schema; the actual implementation diverges in naming only. All FK constraints, indexes, column semantics, and cascade rules match the spec exactly. Cross-domain FKs to the finance domain (purchaseTransactionId, purchasedFromId) are TEXT UUIDs — not enforced at DB level since they reference a different domain. The location tree is a standard adjacency list model with self-referential parentId.
