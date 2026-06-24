# Generic lists CRUD UI

## Purpose

The user-facing `/lists` pages, served by the lists frontend module
(`pillars/lists/app`). An index page lists every `lists` row with kind and
archive filters; a detail page renders any list (`shopping`, `packing`, `todo`,
`generic`) with a kind-agnostic row component and full item CRUD. The UI calls
the lists pillar's REST contract directly via a generated `openapi-fetch` client.

The generic path renders every kind identically: an ordered list of items with
label + qty + unit, a checked-off toggle, and a per-item menu. The `shopping`
kind layers extra affordances on top — see
[shopping-specialisation](../shopping-specialisation/README.md). The other kinds
get the bare generic path.

## Routes

| Path         | Page             | Purpose                                                         |
| ------------ | ---------------- | --------------------------------------------------------------- |
| `/lists`     | `ListsIndexPage` | All lists; kind/archive filters, sort, "+ New list".            |
| `/lists/:id` | `ListDetailPage` | Render the list's items; add / reorder / check / edit / remove. |

Numeric ID URLs — a list's ID is its URL. Page titles use the list's `name` so
the raw ID doesn't surface in UX. Create and edit are **modals**
(`ListNewModal`, `ListEditModal`), not separate routes — they overlay the index
/ detail view rather than navigating away.

## Index page — `/lists`

- Header: "Lists" + a "+ New list" button that opens `ListNewModal`.
- Filters (`ListsIndexFilters`): kind chips (shopping / packing / todo / generic,
  multi-select, default all) and a "Show archived" toggle (default off).
- Sort: `updated` (default), `name`, `created`.
- Each row (`ListRow`): name, kind chip (`ListKindChip`), item count, unchecked
  count, last-updated relative time. Clicking navigates to `/lists/:id`.
- Data comes from `GET /lists?kinds=…&includeArchived=…&sort=…`, which returns
  the aggregate shape `{ id, name, kind, ownerApp, itemCount, uncheckedCount,
lastUpdatedAt, archivedAt }` in one round-trip.

`lastUpdatedAt` is computed server-side as
`COALESCE(MAX(list_items.created_at), lists.created_at)` — it picks up "I added
an item yesterday" without a `lists.updated_at` column. `itemCount` and
`uncheckedCount` come from the same LEFT JOIN + GROUP BY aggregate query; the
index never issues per-list follow-ups.

## Create modal — `ListNewModal`

- **Name** (required, trimmed). For `kind='shopping'` the placeholder suggests a
  dated default.
- **Kind** (required, default `shopping`) via `KindRadioGroup`.
- Create calls `POST /lists` with `{ name, kind }`; `ownerApp` is omitted and
  defaults to `'user'` server-side. On success the modal closes and navigates to
  the new list's detail page.

## Detail page — `/lists/:id`

- Header (`ListDetailHeader`): list name, kind chip, and a three-dot menu
  (`ListDetailMenu`: Rename, Change kind, Archive/Restore, Delete).
- Body: the item list, sorted `position ASC, id ASC`.
- Inline "+ Add item" form (`ListItemAddForm`) at the bottom: a label input;
  pressing Enter submits and clears, ready for the next item. Optional qty / unit
  fields.
- Loaded from `GET /lists/:id`, which returns `{ list, items }` (nullable) in one
  round-trip. The query refetches every 60s while the page is visible to pick up
  changes from other tabs or food's send action.

Adding an item issues `POST /lists/:listId/items` with `label`, optional
`qty`/`unit`, `ref_kind='free'`, `ref_id=null`; the server assigns
`position = MAX(position)+1` and returns the new id and position.

## Edit modal — `ListEditModal`

- Same fields as Create, pre-filled with the list's current values, plus an
  Archive / Restore action.
- Save calls `PATCH /lists/:id` with `{ name?, kind? }` (the body must include at
  least one of the two).
- Changing `kind` after items exist is allowed and warns that affordances
  change but items are not modified (a shopping list becoming a todo keeps its
  checked state; the shopping-only actions disappear).

## Delete

A hard-delete from the detail menu opens `ListDeleteDialog` (confirm:
"Permanently delete `<name>` and its items? This can't be undone."), then calls
`DELETE /lists/:id` and navigates back to `/lists`. Archive is the recommended
path; the dialog makes that clear.

## Item row (`ListItemRow`)

Generic; rendered identically for every kind. Shopping swaps in its own row.

- **Checkbox** toggles `checked` via `POST /items/:id/check` /
  `POST /items/:id/uncheck`. Optimistic; rolls back on error.
- **Label + qty/unit** from `list_items.label` (already denormalised at insert).
- **Sub-line** (optional): a `ref_kind` chip for non-free items and/or a `notes`
  excerpt. Free items with no notes have no sub-line.
- **Menu** (`ListItemMenu`): inline edit (label / qty / unit / notes), move
  up/down, delete.
- Checked items render struck-through and dimmed; order is preserved (checked
  items don't auto-move on the generic path).
- **Drag-to-reorder** writes the whole list's order via
  `POST /lists/:listId/items/reorder` with `{ orderedIds }` in one transaction.
  The server rejects with `{ ok: false, reason: 'BadIds' }` when `orderedIds`
  isn't a permutation of the list's current item ids.
- **Inline label edit**: click turns the row into a text input; Enter saves via
  `PATCH /items/:id`; Esc cancels.

## Rules

- All routes are under `/lists` and require the lists module to be installed.
- List names are non-empty and trimmed.
- New lists default `owner_app='user'`; food's send action overrides to `'food'`.
- Archived lists are hidden from the default index, reachable via "Show
  archived", and restorable from the detail menu.
- Hard-delete cascades item rows in one transaction (service-layer cascade).
- Inline-added items land at the bottom (`position = MAX(position)+1`); the user
  can drag them up afterwards.
- Check / uncheck / reorder are optimistic with rollback + toast on error.
- Reorder rejects when `orderedIds` is not a 1:1 permutation of the current
  items (defensive against stale state).
- Changing a list's `kind` never modifies items — only affordances change.

## Edge cases

| Case                                                 | Behaviour                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Create with whitespace-only name                     | Trimmed and rejected server-side (`name` has `.min(1)` after trim); the modal disables Create until a non-whitespace char is entered. |
| Reorder 50 items by one drag                         | A single `reorder` call with all 50 ids; one transaction.                                                                             |
| Add an item to a list deleted in another tab         | `POST …/items` returns 404; the UI surfaces the deletion and returns to `/lists`.                                                     |
| Check an item another tab unchecked                  | Last write wins (single-user); the optimistic state matches the latest mutation.                                                      |
| Detail polling races a local edit                    | Stale-while-revalidate: the local mutation is the source of truth until its response invalidates the cache.                           |
| `kind='shopping'` → `kind='todo'` with checked items | Items keep their `checked` state; todo renders via the generic path; shopping-only actions disappear.                                 |
| Drag an item to the top                              | Positions are 0-indexed; the first item is `position=0`.                                                                              |
| Archive an already-archived list                     | Idempotent — `archived_at` updates to now.                                                                                            |
| qty="3.5", unit="cups" via the add form              | Stored as `qty=3.5, unit='cups'`; no unit conversion happens here.                                                                    |

## Acceptance criteria

### Routes

- [x] Index (`/lists`) and detail (`/lists/:id`) routes are registered in
      `pillars/lists/app/src/routes.tsx` and code-split via `lazy()`.
- [x] Create and edit are modals (`ListNewModal`, `ListEditModal`) overlaying the
      index / detail view, not standalone routes.

### Index page

- [x] Renders a `ListRow` per list (`pages/lists-index/ListRow.tsx`); clicking a
      row navigates to detail.
- [x] Kind filter chips and the "Show archived" toggle work
      (`pages/lists-index/ListsIndexFilters.tsx`).
- [x] Sort offers updated / name / created (backed by `GET /lists?sort=`).
- [x] Rows show item count, unchecked count, and a relative last-updated time
      from the aggregate query.

### Detail page

- [x] Header shows name, kind chip, and a three-dot menu
      (`pages/detail/ListDetailHeader.tsx`, `ListDetailMenu.tsx`).
- [x] Items render ordered by `position ASC, id ASC` from `GET /lists/:id`.
- [x] Inline add form submits on Enter and clears
      (`pages/detail/ListItemAddForm.tsx`).
- [x] Per item: checkbox, label, optional sub-line, three-dot menu
      (`pages/detail/ListItemRow.tsx`, `ListItemMenu.tsx`).
- [x] Drag-to-reorder works on desktop and touch, writing via
      `POST /lists/:listId/items/reorder`.
- [x] Inline label edit (click → input → Enter saves via `PATCH /items/:id`; Esc
      cancels).
- [x] The detail query refetches every 60s while the page is visible and not in
      the background.

### Modals

- [x] Create modal validates a non-empty name, defaults kind to `shopping`, and
      calls `POST /lists` (`pages/lists-index/ListNewModal.tsx`).
- [x] Edit modal pre-fills, renames, and changes kind with a warning; calls
      `PATCH /lists/:id` (`pages/detail/ListEditModal.tsx`).
- [x] Edit modal exposes Archive / Restore.
- [x] Delete confirm dialog requires explicit confirmation and cancels safely
      (`pages/detail/ListDeleteDialog.tsx`).

### REST surface

- [x] `GET /lists` returns the aggregate shape with computed `itemCount`,
      `uncheckedCount`, `lastUpdatedAt` and honours `kinds`, `includeArchived`,
      `sort`.
- [x] `GET /lists/:id` returns the header plus its items in one (nullable) round-trip.
- [x] `POST /lists`, `PATCH /lists/:id`, archive, unarchive, `DELETE /lists/:id`
      exist; create defaults `ownerApp='user'`.
- [x] Item endpoints exist: add, bulk, update, check, uncheck, remove, reorder.
- [x] `POST /lists/:listId/items/reorder` rejects non-permutation `orderedIds`
      with `{ ok: false, reason: 'BadIds' }`.

### Tests

- [x] Index page covered by `pages/__tests__/ListsIndexPage.test.tsx`; filters /
      row / kind-radio covered under `pages/lists-index/__tests__/`.
- [x] Detail page covered by `pages/__tests__/ListDetailPage.test.tsx`.
      </content>
