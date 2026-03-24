# PRD-019: Inventory App Package & Item UI

**Epic:** [02 — App Package & Edit UI](../themes/inventory/epics/02-app-package-ui.md)
**Theme:** Inventory
**Status:** Draft
**ADRs:** [002 — Shell Architecture](../architecture/adr-002-shell-architecture.md)

## Problem Statement

The current inventory UI is a read-only data table embedded in the finance app. Items can't be created, edited, or deleted from the UI. There's no detail page, no photo gallery, no asset ID search, no location browsing. The inventory needs its own app package with full CRUD capabilities.

## Goal

`@pops/app-inventory` workspace package with: a searchable/filterable item list (table and grid views), item detail pages with photos and connections, create/edit forms with a location tree picker, and fast asset ID lookup. Location tree management is a separate PRD (PRD-020).

## Requirements

### R1: Package Scaffold

Create `packages/app-inventory/`:

```
packages/app-inventory/
  package.json                (@pops/app-inventory)
  tsconfig.json
  src/
    index.ts
    routes.tsx
    pages/
      ItemListPage.tsx
      ItemDetailPage.tsx
      ItemFormPage.tsx          (create + edit, shared form)
    components/
      InventoryCard.tsx + stories
      InventoryTable.tsx + stories
      ItemDetail.tsx + stories
      ItemForm.tsx + stories
      PhotoGallery.tsx + stories
      PhotoUpload.tsx + stories
      ConnectionsList.tsx + stories
      AssetIdBadge.tsx + stories
      LocationBreadcrumb.tsx + stories
      LocationPicker.tsx + stories
      ConditionBadge.tsx + stories
      TypeBadge.tsx + stories
    hooks/
      useInventoryList.ts
      useItemDetail.ts
      useLocationTree.ts
```

### R2: Shell Integration

- Icon: Package/box icon (Lucide)
- Label: "Inventory"
- Route prefix: `/inventory`
- Lazy-loaded routes

### R3: Item List Page (`/inventory`)

**Layout:**
- Dashboard widgets (stats, recent items) — shown when no filters are active
- Search bar: search by item name or asset ID (debounced, 300ms)
- Filter bar: type dropdown, condition dropdown, room dropdown (from location tree roots' children), in-use toggle, deductible toggle
- Sort options: name (A-Z), date added, replacement value, location
- Total items count and total replacement value summary line
- **View toggle + data area:** The `ViewToggleGroup` (PRD-001 R9) is rendered in the same row as the search/filter bar or directly above the table/grid — **not** in the page header. The toggle controls the data view so it must be visually adjacent to the content it affects, not separated by dashboard widgets or other sections.

**Table view** (default):
- Columns: Asset ID, Name, Brand, Type, Condition, Location (breadcrumb), Value, In Use
- Sortable columns
- Click row → item detail page (`/inventory/items/:id`)

**Grid view:**
- `InventoryCard` components in a responsive grid
- Each card shows: primary photo (or placeholder), name, asset ID badge, type badge, location breadcrumb
- Click card → item detail page (`/inventory/items/:id`)

**Navigation paths:** All click-to-detail navigation must use `/inventory/items/:id` — matching the route definition in `routes.tsx`. This applies to table rows, grid cards, search results, connected items, and any other link to an inventory item. Using `/inventory/:id` (without the `items/` segment) produces a route mismatch crash.

**Empty state:** "No items yet. Add your first item." with CTA button.

**Data source:** `inventory.items.list` tRPC query

### R4: Item Detail Page (`/inventory/items/:id`)

**Layout:**
- Header: item name, asset ID badge (prominent), type badge, condition badge
- Photo gallery: grid of item photos, click to expand/lightbox. "Add photo" button.
- Metadata section:
  - Brand, Model
  - Location breadcrumb (clickable → location tree page)
  - In use / Deductible flags
  - Purchase date, Warranty status (with days remaining or "Expired")
  - Replacement value, Resale value
  - Purchased from (entity link → finance)
  - Purchase transaction (link → finance transaction detail)
- Notes section: rendered markdown
- Connections section: list of connected items with asset ID, name, type badge. Each links to its detail page. "Connect to..." button. Expand to show connection chain (placeholder for Epic 3).
- Documents section: placeholder for Paperless-ngx links (Epic 4)
- Actions: Edit button, Delete button (with confirmation)

**Data source:** `inventory.items.get` with location breadcrumb, connections, photos

### R5: Item Create/Edit Form (`/inventory/items/new`, `/inventory/items/:id/edit`)

Shared form component used for both create and edit.

**Fields:**
- Item name (required, text)
- Asset ID (optional, text, validated unique on blur)
- Brand (optional, text)
- Model (optional, text)
- Type (select: Cable, Appliance, Clothing, Plant, Furniture, Electronics, Kitchenware, Tool, Decor)
- Condition (select: New, Excellent, Good, Fair, Poor)
- Location (LocationPicker — tree selector, see R7)
- In use (checkbox)
- Deductible (checkbox)
- Purchase date (date picker)
- Warranty expires (date picker)
- Est. replacement value (number, AUD)
- Est. resale value (number, AUD)
- Notes (textarea with markdown preview toggle)
- Photos (PhotoUpload component — drag-and-drop or file picker)

**Behaviour:**
- Create: `inventory.items.create` mutation, navigate to detail page on success
- Edit: pre-filled form, `inventory.items.update` mutation, navigate to detail page on success
- Asset ID uniqueness validated on blur (check via API before submit)
- Toast notifications on success/error
- Unsaved changes warning on navigation away

### R6: Photo Gallery Component

**On detail page:**
- Grid of photos (2-3 per row on mobile, 4-5 on desktop)
- Click photo → lightbox overlay with full-size image, prev/next navigation
- First photo is the primary/thumbnail (shown on cards)

**On edit page:**
- Same grid with drag-to-reorder
- "Add photo" button: file picker or camera capture on mobile
- Delete button per photo (with confirmation)
- Upload shows progress indicator

### R7: Location Picker Component

A tree selector for choosing an item's location in create/edit forms.

**UX:**
- Button shows current selection as breadcrumb: "Home > Bedroom > Wardrobe Right Door"
- Click opens a tree overlay/modal
- Tree is expandable (click to expand/collapse children)
- Search/filter: type to filter locations by name
- Click a location to select it
- "Clear" button to set location to null (unlocated)
- "Add location" inline option (quick-add a new location without leaving the form)

### R8: Asset ID Search

Fast lookup by asset tag — the primary way to find items in daily use.

- Search bar on the list page accepts asset IDs
- Exact match on asset ID returns the item immediately (no need to scroll through results)
- If the search term matches an asset ID exactly, navigate directly to that item's detail page (or highlight it in the list)
- Asset ID search is case-insensitive

### R9: Image Serving Endpoint

Express route for serving inventory photos:

**Route:** `GET /inventory/images/:itemId/:filename`

- Serves from `{INVENTORY_IMAGES_DIR}/items/{itemId}/{filename}`
- `Cache-Control: public, max-age=31536000, immutable`
- Generated placeholder for items with no photos (item name on coloured background, type-based colour)
- Same pattern as media image serving (PRD-008 R7)

### R10: Responsive Design

All pages and components at three breakpoints:

| Breakpoint | Grid columns | List view |
|-----------|-------------|-----------|
| 375px (mobile) | 2 cards | Simplified table (name, asset ID, type) |
| 768px (tablet) | 3 cards | Full table |
| 1024px+ (desktop) | 4-5 cards | Full table |

- Detail page: stacked on mobile, side-by-side on tablet+
- Photo gallery: 2 columns on mobile, 4+ on desktop
- Location picker: full-screen modal on mobile, popover on desktop

## Out of Scope

- Location tree management page (PRD-020)
- Connection graph visualisation (PRD-021)
- Paperless-ngx document linking UI (PRD-022 — placeholder shown)
- Warranty alerts or value reports (PRD-023)
- Batch import/edit
- Bulk operations (multi-select, bulk move, bulk delete)

## Acceptance Criteria

1. `packages/app-inventory/` exists as a workspace package
2. Inventory appears in the shell app switcher
3. Item list page with search, filter, sort, and table/grid toggle
4. Asset ID search finds items by exact tag match
5. Item detail page displays all metadata, photos, connections, notes
6. Item create form creates items with all fields including location picker
7. Item edit form pre-fills and updates correctly
8. Photo gallery with lightbox on detail page
9. Photo upload with compression on edit page
10. Location picker shows tree, supports search, allows quick-add
11. Delete with confirmation dialog
12. All pages responsive at 375px, 768px, 1024px
13. Storybook stories for all new components
14. `pnpm typecheck` and `pnpm test` pass
15. No regressions in other apps

## User Stories

> **Standard verification — applies to every US below.**

### Batch A — Scaffold

#### US-1: Package scaffold and shell integration
**Scope:** Create `packages/app-inventory/` with `package.json` (@pops/app-inventory), `tsconfig.json`, `src/index.ts`, `src/routes.tsx`. Register in shell app switcher (package/box icon, "Inventory", `/inventory`). Lazy-loaded routes. Verify `pnpm install` resolves.
**Files:** `packages/app-inventory/*`, `apps/pops-shell/` (app switcher config)

### Batch B — Components (parallelisable, depends on Batch A)

#### US-c1: InventoryCard component
**Scope:** Create `InventoryCard.tsx` + story. Photo thumbnail (or placeholder), name, asset ID badge, type badge, location breadcrumb. Click navigates to detail page.
**Files:** `packages/app-inventory/src/components/InventoryCard.tsx`, story

#### US-c2: InventoryTable component
**Scope:** Create `InventoryTable.tsx` + story. Enhanced data table with columns: Asset ID, Name, Brand, Type, Condition, Location (breadcrumb), Value, In Use. Sortable columns. Click row → detail page.
**Files:** `packages/app-inventory/src/components/InventoryTable.tsx`, story

#### US-c3: PhotoGallery and PhotoUpload components
**Scope:** Create `PhotoGallery.tsx` (grid of photos, click → lightbox/fullscreen, first photo = thumbnail) + `PhotoUpload.tsx` (drag-and-drop or file picker, camera capture via `<input capture="environment">`, progress indicator, delete per photo, drag-to-reorder) + stories for both.
**Files:** `packages/app-inventory/src/components/PhotoGallery.tsx`, `PhotoUpload.tsx`, stories

#### US-c4: LocationPicker component
**Scope:** Create `LocationPicker.tsx` + story. Button shows current selection as breadcrumb ("Home > Bedroom > Wardrobe"). Click opens tree overlay/modal. Expandable/collapsible nodes. Type to search/filter. Click leaf to select. "Clear" button for no location. "Add location" inline quick-add.
**Files:** `packages/app-inventory/src/components/LocationPicker.tsx`, story

#### US-c5: Badge components
**Scope:** Create `AssetIdBadge.tsx` (prominent display of asset tag), `ConditionBadge.tsx` (colour-coded: green=New, blue=Excellent, yellow=Good, orange=Fair, red=Poor), `TypeBadge.tsx`, `LocationBreadcrumb.tsx` (clickable path). Stories for all.
**Files:** `packages/app-inventory/src/components/AssetIdBadge.tsx`, `ConditionBadge.tsx`, `TypeBadge.tsx`, `LocationBreadcrumb.tsx`, stories

#### US-c6: ConnectionsList component
**Scope:** Create `ConnectionsList.tsx` + story. List of connected items: asset ID badge, name, type badge. Click → navigate to that item's detail page. Connection count in section header. "Connect to..." button placeholder.
**Files:** `packages/app-inventory/src/components/ConnectionsList.tsx`, story

### Batch C — Pages (parallelisable, depends on Batch B)

#### US-2: Item list page
**Scope:** Create `ItemListPage.tsx`. Table/grid toggle (InventoryTable vs InventoryCard grid). Search bar (by name or asset ID). Filter bar: type, condition, room (from location tree), in-use toggle, deductible toggle. Sort: name, date added, value, location. Total item count + total replacement value summary line. Empty state. Data from `inventory.items.list`.
**Files:** `packages/app-inventory/src/pages/ItemListPage.tsx`, hooks

#### US-3: Item detail page
**Scope:** Create `ItemDetailPage.tsx`. Header: name, asset ID badge, type badge, condition badge. PhotoGallery. Metadata: brand, model, location breadcrumb (clickable), in-use/deductible flags, purchase date, warranty status (with days remaining or "Expired"), values, purchased from, purchase transaction. Notes (rendered markdown). ConnectionsList. Documents section (placeholder for PRD-022). Edit + Delete actions (delete with confirmation). 404 if not found.
**Files:** `packages/app-inventory/src/pages/ItemDetailPage.tsx`

#### US-4: Item create/edit form
**Scope:** Create `ItemFormPage.tsx` (shared for create + edit). All fields: name (required), asset ID (validated unique on blur), brand, model, type (select), condition (select), location (LocationPicker), in-use, deductible, purchase date, warranty expires, replacement value, resale value, notes (textarea with markdown preview). PhotoUpload section. Create: `inventory.items.create`, navigate to detail. Edit: pre-fill, `inventory.items.update`. Unsaved changes warning. Toast on success/error.
**Files:** `packages/app-inventory/src/pages/ItemFormPage.tsx`

#### US-7: Asset ID search
**Scope:** In the list page search bar, when the search term exactly matches an asset ID (case-insensitive), navigate directly to that item's detail page or highlight it in the list. Uses `inventory.items.searchByAssetId`.
**Files:** `ItemListPage.tsx` (search logic)
