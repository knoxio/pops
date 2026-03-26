# PRD-047: Location Tree Management

> Epic: [02 — Location Tree Management](../../epics/02-location-tree-management.md)
> Status: To Review

## Overview

Build the location tree management UI. Hierarchical browser for creating, editing, reordering, and deleting locations. Browse items per location. Supports arbitrary depth with multiple root locations (Home, Car, Storage Cage).

## Route

`/inventory/locations`

## UI Components

### Tree Browser

- Collapsible tree view showing all locations hierarchically
- Each node: name, item count badge, expand/collapse chevron
- Click node to show items at that location in a side panel or below
- Multiple root nodes supported (Home, Car, Storage Cage, Friend X)
- Remembers expand/collapse state per session

### CRUD Operations

- **Add root location:** button at tree top
- **Add child:** context menu or "+" button on any node
- **Rename:** inline edit on double-click or context menu
- **Delete:** confirmation modal showing cascade info ("This will also delete X child locations. Y items will be unassigned.")

### Drag-and-Drop Reorder

- Drag nodes to reorder siblings (updates sortOrder)
- Drag to move between parents (updates parentId)
- Circular reference prevention: cannot drop a parent into its own subtree
- Mobile fallback: up/down arrow buttons instead of drag-and-drop

### Items at Location

- Selecting a location shows items assigned to it
- "Include sub-locations" toggle to show items from entire subtree
- Item list: name, asset ID, type — click to navigate to item detail

## Business Rules

- Deleting a location cascade-deletes all child locations
- Items at deleted locations get `locationId = NULL` (orphaned, not deleted)
- Circular references prevented: a node cannot become a descendant of itself
- `sortOrder` determines sibling order within a parent
- Moving a node to a new parent resets its sortOrder to the end of that parent's children
- Root locations have `parentId = NULL`

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Delete location with children | Confirmation shows child count and item count; all descendants cascade-deleted, their items orphaned |
| Drag node onto itself | No-op |
| Drag parent into own subtree | Rejected — circular reference prevention |
| Location with no items | Empty state: "No items at this location" |
| No locations exist | Empty state: "No locations — create your first location to organise items" |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-tree-browser](us-01-tree-browser.md) | Collapsible tree view with expand/collapse, item count badges, multiple root support | Done | No (first) |
| 02 | [us-02-location-crud](us-02-location-crud.md) | Add root/child locations, inline rename, delete with cascade confirmation and item orphaning | Done | Blocked by us-01 |
| 03 | [us-03-drag-and-drop](us-03-drag-and-drop.md) | Drag-and-drop reorder and reparent with circular reference prevention, mobile arrow fallback | Partial | Blocked by us-01 |
| 04 | [us-04-items-at-location](us-04-items-at-location.md) | Items panel for selected location, include sub-locations toggle, item list with navigation | Done | Blocked by us-01 |

US-02, US-03, and US-04 can parallelise after US-01.

## Out of Scope

- Location creation during item edit (that's in Epic 01's item form)
- AI-assisted location path suggestions
- Map or floor plan view
- Bulk item reassignment between locations
