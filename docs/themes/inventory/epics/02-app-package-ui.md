# Epic: App Package & Edit UI

**Theme:** Inventory
**Priority:** 2 (first editable UI — depends on schema)
**Status:** Done

## Goal

Create the `@pops/app-inventory` workspace package and build full CRUD pages — replacing the current read-only data table with a proper inventory management UI. Items can be created, edited, viewed in detail, and deleted. The location tree is browsable and editable. Photos are viewable in a gallery.

## Scope

### In scope

- Create `packages/app-inventory/` workspace package (same pattern as `@pops/app-media`)
- Export route definitions for the shell to lazily import
- Register inventory in the shell's app switcher
- Pages:
  - **Inventory list page** (`/inventory`) — searchable, filterable, sortable table/grid of all items. Search by item name or asset ID. Filter by room, type, condition, in-use status. Toggle between table view and card/grid view.
  - **Item detail page** (`/inventory/items/:id`) — full item view: all metadata, photo gallery, location breadcrumb, connected items list, notes (rendered markdown), linked purchase transaction, linked entity, linked Paperless documents (placeholder for Epic 4)
  - **Item create/edit page** (`/inventory/items/new`, `/inventory/items/:id/edit`) — form with all fields: name, brand, model, asset ID, type, condition, room/location picker (tree selector), in-use, deductible, purchase date, warranty expires, replacement value, resale value, notes (markdown editor), photo upload
  - **Location tree page** (`/inventory/locations`) — visual tree of all locations. Add, rename, move, delete locations. Drag-to-reorder within a level. See item count per location.
  - **Search results** — global search by asset ID or item name, instant results
- Components:
  - `InventoryCard` — item card with photo thumbnail, name, asset ID, type badge, location
  - `InventoryTable` — enhanced data table (extends current, adds asset ID column, location column)
  - `LocationPicker` — tree selector for choosing an item's location (used in create/edit forms)
  - `LocationTree` — visual tree component for the locations management page
  - `PhotoGallery` — grid of item photos with lightbox/expand on click
  - `PhotoUpload` — drag-and-drop or file picker for adding photos to an item
  - `ConnectionsList` — list of connected items with links to their detail pages
  - `AssetIdBadge` — prominent display of the asset ID
- Responsive from day one
- Stories for all new components

### Out of scope

- Connection graph visualisation (Epic 3)
- Paperless-ngx document linking UI (Epic 4 — placeholder shown on detail page)
- Warranty alerts or value reports (Epic 5)
- Batch import UI
- Bulk edit (select multiple items, change field)

## Deliverables

1. `packages/app-inventory/` workspace package exists and builds cleanly
2. Shell lazily imports `@pops/app-inventory/routes` — inventory appears in app switcher
3. Inventory list page with search, filter, sort, and table/grid toggle
4. Item detail page with full metadata, photos, connections, notes
5. Item create/edit form with all fields including location tree picker
6. Location tree management page with add/rename/move/delete
7. Photo upload from the item edit page
8. All pages responsive at 375px, 768px, 1024px
9. Storybook stories for all new components
10. `pnpm typecheck` and `pnpm test` pass
11. No runtime regressions in existing apps

## Target Routes

```
/inventory                    → Item list (table/grid)
/inventory/items/new          → Create item
/inventory/items/:id          → Item detail
/inventory/items/:id/edit     → Edit item
/inventory/locations          → Location tree management
```

## Dependencies

- Foundation Epic 1 (UI Library Extraction) — `@pops/ui` must exist
- Foundation Epic 2 (Shell Extraction) — shell must support app packages
- Epic 0 (Schema Upgrade) — new schema and routers

## Risks

- **Location tree picker UX** — A 5-level deep tree in a form selector needs careful UX. Breadcrumb-style selection ("Home > Bedroom > Wardrobe > Right Door") is clearer than a nested dropdown. Mitigation: start with a searchable tree overlay — type to filter, click to expand, click leaf to select.
- **Photo upload on mobile** — Camera-to-POPS flow needs to work on iPhone (PWA). The file picker on iOS should allow camera capture. Mitigation: use standard `<input type="file" accept="image/*" capture="environment">` — this triggers the camera or photo library on mobile.
- **Migration from current InventoryPage** — The existing read-only page in pops-pwa needs to be replaced by the new app package. Coordinate with shell extraction. Mitigation: if the shell isn't extracted yet, the new package can coexist temporarily.
