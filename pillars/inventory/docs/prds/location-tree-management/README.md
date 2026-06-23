# Location Tree Management

Status: Partial — tree browse, CRUD, drag/move, and the items panel all ship. Gaps (cascade-delete of child locations, per-location item-count badge, session-persisted UI state, server-side sub-location item gathering) are tracked in `../../ideas/location-tree-management-gaps.md`.

Hierarchical location manager at `/inventory/locations`. Arbitrary-depth tree of locations with multiple roots (Home, Car, Storage Cage, …). Create, rename, reorder, reparent, and delete locations, and browse the items physically held at any location.

## Data model

`locations` (inventory pillar's own SQLite DB):

- `id` text PK (uuid)
- `name` text, not null
- `parentId` text, nullable — `NULL` for roots; references another `locations.id` (no DB-level FK on this column)
- `sortOrder` integer, not null, default 0 — sibling order within a parent
- `lastEditedTime` text (ISO)
- Indexes on `parentId`, `name`, and `(parentId, sortOrder)`.

`home_inventory.locationId` references `locations.id` with **`ON DELETE SET NULL`** — deleting a location unlocates its items rather than deleting them.

## REST API surface

Read:

- `GET /locations` — flat list, `{ data, total }`, ordered by `sortOrder` then `name`.
- `GET /locations/tree` — nested `{ data: LocationTreeNode[] }`; assembled in-memory from the flat list, roots first. A node whose parent is absent is surfaced as a root.
- `GET /locations/:id` — single location (404 if missing).
- `GET /locations/:id/path` — root-first ancestor chain for breadcrumbs.
- `GET /locations/:id/children` — direct children, ordered by `sortOrder` then `name`.
- `GET /locations/:id/delete-stats` — `{ childCount, descendantCount, itemCount, totalItemCount }`.

Write:

- `POST /locations` — `{ name (min 1), parentId?, sortOrder? }` → 201. 404 if `parentId` is given but missing.
- `PATCH /locations/:id` — partial `{ name?, parentId?, sortOrder? }`. Reorder and reparent both go through this endpoint; there is no dedicated reorder/move route. 409 on self-parent or cycle.
- `DELETE /locations/:id?force=` — without `force`, a non-empty location (has children or items) returns `{ requiresConfirmation: true, stats }` instead of deleting; with `force=true` it deletes. (See idea #1: only the target row is removed today.)

Item browsing reuses `GET /items?locationId=&includeChildren=` from the items contract.

## Business rules

- Roots have `parentId = NULL`; depth is unbounded.
- `sortOrder` orders siblings within a parent.
- Cycle prevention: a location cannot become its own parent (`409`, self-parent) or a descendant of itself (`409`, cycle) — enforced server-side by walking the ancestor chain, and client-side by disabling descendants in the Move dialog / aborting an invalid drag.
- Deleting a location unlocates its items (`locationId → NULL`) via the FK.
- A non-empty delete requires explicit confirmation; `delete-stats` supplies the child / descendant / item counts shown in the dialog.

## UI (`/inventory/locations`)

Two-pane layout (tree left, contents panel right; stacked on mobile).

Tree:

- Collapsible nested tree from `GET /locations/tree`; roots open by default, deeper levels collapsed.
- Each node: drag handle (on fine pointers), expand chevron (only when it has children), folder icon, name, hover action buttons, and a badge showing the subtree's location count (only on nodes with children).
- Selecting a node highlights it and loads its contents panel; loading skeleton while the tree fetches; empty state when no locations exist.

CRUD (hover action buttons, not a context menu):

- "Add root location" opens a dialog; per-node "add child" opens an inline name input nested under the parent.
- Double-click a name to rename inline; Enter/blur saves via `PATCH`, Escape cancels.
- Delete opens a confirmation dialog populated from `delete-stats` ("N sub-locations … will all be deleted", "M items will become unlocated"); confirming forces the delete.
- Create/update/delete each fire a toast; the tree refetches (query invalidation) after every mutation.

Reorder & move:

- dnd-kit sortable tree. Dragging between siblings rewrites their `sortOrder` (a PATCH per shifted sibling); dragging onto another node reparents (PATCH `parentId`), placing the node at the target's children. A drop-indicator line shows the landing spot.
- Move dialog (`Move to…`) as a pointer-agnostic alternative; the node's own descendants are disabled as targets.
- Coarse-pointer (touch) devices get up/down arrow buttons instead of a drag handle; arrows are hidden at the sibling boundary.

Items-at-location panel:

- Header shows the location name and breadcrumb path (root → location).
- Item rows: name, asset-ID badge, type badge; clicking a row navigates to the item detail page. Summary line shows item count and total replacement value; "Add Item Here" deep-links to the item-create form pre-filled with the location.
- "Include sub-locations" toggle (default on, shown only when the location has children) merges items from the whole subtree.
- Loading skeletons while items fetch; empty state "No items at this location."

## Acceptance criteria

- [x] `/inventory/locations` renders a collapsible nested tree from `GET /locations/tree`, supporting multiple roots and arbitrary depth.
- [x] Chevron appears only on nodes with children; expand/collapse toggles a node's subtree.
- [x] Selecting a node highlights it and opens its contents panel; empty state shown when no locations exist; skeleton shown while loading.
- [x] Add-root dialog and per-node inline add-child both create via `POST /locations` (root → `parentId: null`) and the tree refetches.
- [x] Double-click rename saves via `PATCH /locations/:id`; Escape reverts.
- [x] Empty/whitespace names are rejected at the `POST`/`PATCH` zod boundary (400).
- [x] Delete confirmation dialog is populated from `GET /locations/:id/delete-stats`; a non-empty location returns `requiresConfirmation` until forced.
- [x] Confirming a delete unlocates the location's items (`locationId → NULL`) via the FK.
- [x] Drag-reorder between siblings rewrites `sortOrder`; drag-onto-node reparents via `PATCH parentId` and appends to the target's children; a drop indicator shows the target.
- [x] Reparenting into the node's own subtree is rejected — server returns 409 (cycle/self-parent); the client disables descendants in the Move dialog and aborts the drag with a toast.
- [x] Coarse-pointer devices get up/down reorder arrows (disabled at boundaries) in place of the drag handle.
- [x] Contents panel shows the location name, breadcrumb path, and item rows (name, asset ID, type); clicking a row opens item detail.
- [x] "Include sub-locations" toggle merges subtree items; the panel summary reflects the current count and total value.
- [x] Cross-pillar item reads use `GET /items` with a `locationId` filter.

## Out of scope

- Creating locations from inside the item form (lives in the item editor).
- AI-assisted location-path suggestions; map / floor-plan view; bulk item reassignment between locations.
