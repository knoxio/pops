# Items List Page

> Status: Done — table + grid views, filters, asset-id search redirect, and value summary are shipped. Server-driven sorting and URL-persisted pagination are not built (client-side only); see ideas/items-list-server-sort-pagination.md.

The inventory app's home page: a dual-mode (table / grid) browse of all items, with search, filters, a live value summary, and per-row actions. This is the default `/inventory` route (rendered as the route index).

## Routes

| Route        | Page                                           |
| ------------ | ---------------------------------------------- |
| `/inventory` | Items list — route index, default landing page |

## Data source

Reads from the inventory pillar's own SQLite `home_inventory` items table (item rows, locations) via the inventory REST contract. No cross-pillar fetches.

## REST surface (inventory contract)

| Endpoint                                 | Use                                                                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /items`                             | List items with `search`, `type`, `condition`, `inUse`, `locationId` filters; returns `data[]`, `pagination` meta, and `totals` (`totalReplacementValue`, `totalResaleValue`) |
| `GET /items/search/by-asset-id?assetId=` | Exact, case-insensitive asset-id lookup; returns the item or `null`                                                                                                           |
| `GET /items/stats/distinct-types`        | Distinct non-null `type` values, to populate the Type filter                                                                                                                  |
| `GET /locations/tree`                    | Location hierarchy as a nested tree, flattened/indented into the Location filter and used to build the per-row breadcrumb path map                                            |
| `DELETE /items/:id`                      | Delete an item from the per-row actions menu                                                                                                                                  |

## Page layout

- **Header**: page title (`inventory.title`, translated) plus a persistent **+ Add Item** button → `/inventory/items/new`. Always visible, including the empty state (it is the empty-state CTA).
- **Filters bar** (above the data): search field, Type select, Condition select, In Use select, Location select, and a **Clear filters** button shown only when a non-search filter is active.
- **Summary + view toggle row** (adjacent to the data, not in the header): a chip showing item count and, when non-zero, `… replacement` / `… resale` value totals; a Table/Grid `ViewToggleGroup` aligned right.
- **Content**: table or grid, an empty state, or a loading skeleton.

### Acceptance criteria — layout & navigation

- [x] `/inventory` route index renders this page.
- [x] **+ Add Item** in the page header navigates to `/inventory/items/new` and is always rendered.
- [x] View toggle lives in the summary row beside the data, not in the page header.
- [x] Loading shows a skeleton (filter row + rows); switching views does not refetch.

## Table view

Columns: Asset ID (badge), Name, Brand, Type (badge), Condition (badge), Location (breadcrumb), Value (AUD), Purchased (locale date), In Use (check / dash). Per-row `⋯` actions menu: Edit → `/inventory/items/:id/edit`, Delete → confirmation dialog.

### Acceptance criteria — table

- [x] Renders all columns above; null Brand/Type/Condition/Value/Purchased render an em-dash (Asset ID renders nothing when null).
- [x] Name, Brand, Location, Value, and Purchased headers are sortable (client-side, via the shared `DataTable`/`SortableHeader`).
- [x] Clicking a row navigates to `/inventory/items/:id`.
- [x] Condition renders a `ConditionBadge`; only known conditions (canonical `new/good/fair/poor/broken` plus legacy Title-Case `Excellent/Good/Fair/Poor` from imports) render a badge, otherwise an em-dash.
- [x] Location renders a `LocationBreadcrumb` built from the location-tree path map, with the full path in a `title` tooltip; falls back to the flat `location` string when no `locationId` path exists.
- [x] Each row's `⋯` opens a dropdown: **Edit** navigates to the edit route; **Delete** opens a confirmation dialog that calls `DELETE /items/:id` and invalidates the list on confirm.

## Grid view

Responsive card grid: `grid-cols-2 sm:3 md:4 lg:5`. Each card is a button with a 4:3 photo area (asset-id badge overlaid top-left), item name (clamped to 2 lines), Type badge, and location row with a `MapPin` icon.

### Acceptance criteria — grid

- [x] Responsive columns 2 → 3 → 4 → 5.
- [x] Card photo area is 4:3; a `Package` placeholder icon renders when there is no photo or the image errors (never a broken image), with a skeleton while loading.
- [x] Card shows name, Type badge, asset-id badge, and location (breadcrumb when segments exist, else the flat location name).
- [x] Card has a hover/focus state (background + shadow transition, focus ring).
- [x] Clicking a card navigates to `/inventory/items/:id`.

## Filters, search & states

- **Search**: filters by name/asset-id, debounced 300ms, feeding `GET /items?search=`. Pressing **Enter** triggers an exact asset-id lookup; if a match is found, navigate straight to that item's detail page (otherwise stay on the list).
- **Type** select: populated from `GET /items/stats/distinct-types`, default "All Types".
- **Condition** select: options from the shared `INVENTORY_CONDITIONS` set, default "All Conditions".
- **In Use** select: All / In Use / Not In Use.
- **Location** select: the location tree flattened with indentation, default "All Locations".
- All filter values live in URL query params: `q`, `type`, `condition`, `inUse`, `locationId` — the page is bookmarkable and back/forward works.
- **Clear filters** resets `type`, `condition`, `inUse`, `locationId` (search is cleared via the input's own clear affordance).

### Acceptance criteria — filters & search

- [x] Search is debounced 300ms before hitting `GET /items`.
- [x] Enter in the search field calls `GET /items/search/by-asset-id`; a hit navigates to `/inventory/items/:id`, a miss/empty/error leaves the user on the list.
- [x] Type, Condition, In Use, and Location selects each filter the list and are reflected in URL params.
- [x] All filter state survives reload via URL params; **Clear filters** appears only when a non-search filter is active and resets them.
- [x] Empty database renders "No inventory items yet."; active filters with no matches render "No items match your filters." — both with the `Package` icon, and the header **Add Item** remains the primary CTA.
- [x] Summary chip shows the item count and, when > 0, replacement / resale value totals from the list response `totals`.

## View persistence

- [x] View mode (table/grid) persists in `localStorage` under `inventory-view-mode` via `ViewToggleGroup`; on load it restores, defaulting to **table** when unset.

## Edge cases

| Case                               | Behaviour                                         |
| ---------------------------------- | ------------------------------------------------- |
| No items exist                     | Empty state, header Add Item as CTA               |
| Filters return no results          | "No items match your filters."                    |
| Search exactly matches an asset id | Navigate directly to that item's detail page      |
| Long location path                 | Full breadcrumb in the cell `title` tooltip       |
| Item has no photo (grid)           | `Package` placeholder, never a broken `<img>`     |
| Unknown / legacy condition value   | Em-dash in table rather than a mis-coloured badge |

## Out of scope

- Item detail view, create/edit form, location-tree management, connections graph, warranty alerts, and value/insurance reporting (their own PRDs).
- Server-side sorting and URL-persisted pagination — not built; see `../../ideas/items-list-server-sort-pagination.md`.
