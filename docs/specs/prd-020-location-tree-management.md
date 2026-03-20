# PRD-020: Location Tree Management

**Epic:** [02 — App Package & Edit UI](../themes/inventory/epics/02-app-package-ui.md)
**Theme:** Inventory
**Status:** Draft

## Problem Statement

The location tree is the backbone of "where is my stuff?" — but it needs a management UI for creating, organising, and maintaining the tree. The Notion import seeds the initial tree from Room + Location values, but the user needs to add new locations (a new drawer, a new shelf), reorganise (moved the router from bedroom to living room), and see what's at each location.

## Goal

A dedicated location tree management page where the user can visualise the full tree, add/rename/move/delete locations, see item counts per location, and drill into a location to see its contents.

## Requirements

### R1: Location Tree Page (`/inventory/locations`)

**Layout:**
- Full-screen tree view showing all locations hierarchically
- Each node shows: location name, item count badge, expand/collapse toggle
- Root nodes (Home, Car, Storage Cage) at the top level
- Expandable: click to show/hide children
- Selected location highlights and shows its contents in a side panel or below

**Interaction:**
- Click location name → select it, show items in that location
- Click expand toggle → show/hide children
- Double-click or edit icon → inline rename
- Drag-and-drop → move location (reparent)
- Right-click or menu → context menu (rename, add child, move, delete)

### R2: Add Location

**Entry points:**
- "Add location" button at the top of the tree page
- "Add child" action on any existing location (context menu or icon)
- Quick-add inline in the LocationPicker (PRD-019 R7)

**Flow:**
1. User clicks "Add child" on "Bedroom"
2. A new node appears as a child of Bedroom with an editable text field
3. User types "Nightstand"
4. Press Enter → `inventory.locations.create({ name: "Nightstand", parentId: bedroomId })`
5. New location appears in the tree

**Adding a root location:**
- "Add root location" button creates a new top-level node (parentId = null)
- Used for: adding "Office", "Friend's House", "Storage Cage"

### R3: Rename Location

- Double-click a location name → inline edit mode
- Or: right-click → "Rename" → inline edit
- Press Enter to save, Escape to cancel
- Calls `inventory.locations.update({ id, name })`

### R4: Move Location (Reparent)

Move a location and all its children to a new parent.

**Drag-and-drop:**
- Drag a location node → drop on another location → reparent
- Visual indicator showing where the node will be placed (as child of drop target)
- Can also drag to root level (reparent to null)

**Context menu fallback:**
- Right-click → "Move to..." → location picker modal
- Useful on mobile where drag-and-drop is harder

**Validation:**
- Can't move a location into its own subtree (circular reference)
- Moving a location moves all its children and all items at those locations

Calls `inventory.locations.update({ id, parentId: newParentId })`

### R5: Delete Location

- Right-click → "Delete" or delete icon
- **If location has items:** confirmation dialog: "This location contains X items. They will become unlocated. Continue?"
- **If location has children:** confirmation dialog: "This location has Y sub-locations (containing Z items total). All will be deleted. Items will become unlocated. Continue?"
- **If empty (no items, no children):** delete immediately with toast confirmation

Calls `inventory.locations.delete({ id, force: true })` after user confirmation.

### R6: Reorder Locations

Within a level, locations can be manually reordered.

- Drag-and-drop within the same parent → reorder (updates `sort_order`)
- Or: up/down buttons on each node (mobile-friendly)
- Default order: alphabetical. Manual reorder overrides.

### R7: Location Contents Panel

When a location is selected in the tree, show its contents:

**Side panel (desktop) or below the tree (mobile):**
- Location name as header with breadcrumb path
- List of items at this location (name, asset ID, type badge)
- Toggle: "Include items in sub-locations" → shows items from the entire subtree
- Item count and total replacement value for this location
- Click an item → navigate to item detail page
- "Add item here" button → navigate to item create form with location pre-selected

### R8: Responsive Design

| Viewport | Layout |
|----------|--------|
| Mobile (375px) | Full-width tree, contents panel below. Drag-and-drop disabled — use context menu for move. |
| Tablet (768px) | Side-by-side: tree on left (40%), contents on right (60%) |
| Desktop (1024px+) | Same side-by-side with more room |

### R9: Route

```typescript
{ path: 'locations', element: <LocationTreePage /> }
```

URL: `/inventory/locations`

Add "Locations" to the inventory app's secondary navigation.

## Out of Scope

- Batch item relocation (move 10 items to a new location at once)
- Location photos or descriptions
- Floor plan / map view of locations
- Location-based notifications ("you left something at Mum's")
- Auto-suggest locations based on item type

## Acceptance Criteria

1. Location tree displays all locations hierarchically with item counts
2. Locations can be added (as root or child) with inline editing
3. Locations can be renamed via double-click or context menu
4. Locations can be moved via drag-and-drop or "Move to..." dialog
5. Circular reparenting is prevented (can't move a location into its own subtree)
6. Locations can be deleted with appropriate confirmation dialogs
7. Locations can be reordered within a level
8. Selected location shows its items in a side panel
9. "Include sub-locations" toggle shows items from the full subtree
10. Item count and total value displayed per location
11. Page is responsive at all three breakpoints
12. Storybook stories for: LocationTree, LocationNode, LocationContentsPanel
13. `pnpm typecheck` and `pnpm test` pass

## User Stories

> **Standard verification — applies to every US below.**
>
> **Sizing:** Each story is scoped for one agent, ~15-20 minutes. All stories are parallelisable (all modify the same page but different sections).

#### US-1: Location tree display
**Scope:** Create `LocationTreePage.tsx`. Hierarchical tree of all locations from `inventory.locations.getTree`. Each node: name, item count badge, expand/collapse toggle. Click to select (highlights node). Responsive: full-width tree on mobile, side-by-side tree + contents panel on tablet+. Add route + "Locations" to inventory secondary nav. Storybook stories for `LocationTree` and `LocationNode` components.
**Files:** `packages/app-inventory/src/pages/LocationTreePage.tsx`, tree components

#### US-2: Add locations
**Scope:** Add "Add root location" button at top of tree. "Add child" icon/action on each node. New node appears with editable text field. Enter saves via `inventory.locations.create`. Escape cancels. New location appears immediately in tree.
**Files:** `LocationTreePage.tsx`

#### US-3: Rename and reorder
**Scope:** Double-click location name → inline edit mode. Enter saves, Escape cancels. Drag within same parent level → reorder (updates `sort_order`). Mobile fallback: up/down buttons. Calls `inventory.locations.update`.
**Files:** `LocationTreePage.tsx`

#### US-4: Move locations (reparent)
**Scope:** Drag a location node onto another → reparent as child of drop target. Visual indicator showing drop target. Validation: can't move a location into its own subtree (circular reference check). Mobile fallback: right-click or menu → "Move to..." → LocationPicker modal. Calls `inventory.locations.update({ id, parentId })`.
**Files:** `LocationTreePage.tsx`

#### US-5: Delete locations
**Scope:** Delete icon/action per location. If has items: confirmation "This location has X items. They will become unlocated." If has children: "This location has Y sub-locations with Z items total. All sub-locations will be deleted." Empty locations: delete immediately with toast. Calls `inventory.locations.delete({ id, force: true })`.
**Files:** `LocationTreePage.tsx`

#### US-6: Location contents panel
**Scope:** When a location is selected in the tree, show its contents in a side panel (desktop) or below (mobile). Location name + breadcrumb. List of items: name, asset ID, type badge. "Include items in sub-locations" toggle. Item count + total replacement value. Click item → navigate to detail page. "Add item here" button → navigate to create form with location pre-selected. Storybook story.
**Files:** `LocationTreePage.tsx`, `LocationContentsPanel` component
