# PRD-140: Generic Lists CRUD UI

> Epic: [04 — Lists & Shopping](../../epics/04-lists-and-shopping.md)

## Overview

Build the user-facing pages under `/lists/*`. An index page that lists every `lists` row with kind / archive filters; a detail page that renders any list (`shopping`, `packing`, `todo`, `generic`) using a kind-agnostic row component; create / rename / archive / restore actions; ad-hoc item add; manual reorder via drag. The tRPC procedures that back the pages.

The UI is **deliberately generic**. Every kind renders the same way out of the box: ordered list of items, label + qty + unit, checked-off toggle, three-dot menu. The shopping kind layers extra affordances in PRD-141 (`kind='shopping'` only — batch uncheck-all, clear-checked, etc.). Other kinds get the bare path.

This is the biggest UI PRD in Epic 04 — it stands up the whole list-handling experience that PRDs 141 and 142 build on.

## Routes

| Path         | Page             | Purpose                                                 |
| ------------ | ---------------- | ------------------------------------------------------- |
| `/lists`     | `ListsIndexPage` | List of all lists; filter + new                         |
| `/lists/:id` | `ListDetailPage` | Render the list's items; add / reorder / check / remove |

The "New list" and "Edit list" surfaces are **modals**, not separate routes. They overlay the index / detail view via URL query params `?new=1` and `?edit=1` respectively on top of the base path — keeps the modals deep-linkable but stays in-context. Implementation: react-router-v6 nested routes with the modal as the `Outlet`. There is NO `/lists/new` or `/lists/:id/edit` standalone page.

Numeric ID URLs (no slugs) — lists don't need a stable global identifier; the ID is the URL. Page titles use the list's `name` so the URL ID doesn't leak into UX.

## Page Specifications

### `/lists` — Index

- Header: "Lists" + "+ New list" button → opens `/lists?new=1` modal.
- Filter chips:
  - `kind`: shopping / packing / todo / generic (multi-select, default: all selected).
  - "Show archived" toggle (default off).
- Each row: list name, kind chip, item count (`COUNT(*) WHERE list_id=...`), unchecked-count badge, last-updated relative time. Click row → `/lists/:id`.
- Empty state: "No lists yet. Click '+ New list' or send a recipe to a shopping list from Food."
- Sort dropdown: `updated_at DESC` (default), `name ASC`, `created_at DESC`.
- No pagination — lists are user-managed; volume stays in the dozens. If volume exceeds 100, add cursor pagination then.

`last-updated` derives from the greater of (a) `MAX(list_items.created_at)` for the list's items and (b) `lists.created_at` — picks up "I added an item yesterday" without a separate `lists.updated_at` column. `itemCount`, `uncheckedCount`, and `lastUpdatedAt` are all computed by the router itself via a single aggregate SQL query (left join `lists` to `list_items`, GROUP BY list id). This **bypasses PRD-112's `listLists` service** (which only returns `lists` rows) — the router owns the aggregate query directly. No PRD-112 amendment required.

### `/lists/new` — Create modal

- Form fields:
  - **Name** (required, defaults blank). For `kind='shopping'`, placeholder is `"Shopping list — <yyyy-MM-dd>"` and the field auto-fills on focus if still empty.
  - **Kind** (required, default `shopping`). Radio group with the four kinds.
- [Cancel] [Create] buttons. Create calls `lists.list.create({ name, kind })` then closes the modal and navigates to `/lists/:id`.

### `/lists/:id` — Detail

- Header: list name + kind chip + three-dot menu (Rename, Change kind, Archive, Delete).
- For `kind='shopping'`: the header also shows PRD-141's affordances (uncheck-all, clear-checked, sort). Other kinds get only the basic header.
- Item list body — see "Item Row" below.
- "+ Add item" inline form at the bottom of the list:
  - Single text input for the label.
  - Pressing Enter submits and clears, ready for the next item. Mobile-first: pressing the "add" button on the keyboard works.
  - Optional qty + unit fields (collapsed by default; click to reveal). For shopping lists, qty/unit are common so PRD-141 may expand them by default.
- Empty state: "No items yet. Type a label below and press Enter."

Adding an item creates a `list_items` row with:

- `label` = user input.
- `qty=null, unit=null` unless the optional fields were filled.
- `ref_kind='free', ref_id=null`.
- `position` = `MAX(position) + 1` for the list.
- `checked=0`.

### `/lists/:id?edit=1` — Edit modal

- Same form as Create but pre-filled with the list's current values.
- Additional [Archive] / [Restore] button at the bottom.
- Save calls `lists.list.update({ id, name?, kind? })`.

Changing `kind` after items exist is allowed but warns: "Changing kind may hide or show affordances. Items aren't modified." (E.g. a shopping list with check-off rows becomes a todo list — checked-state survives, but the shopping-specific actions disappear).

### `/lists/:id/delete` (action, not a page)

A hard-delete from the three-dot menu prompts a confirm dialog ("Permanently delete `<name>` and its N items? This can't be undone.") and calls `lists.list.delete({ id })` → navigates to `/lists`.

Archive is the recommended path; delete is for accidents and the prompt makes that clear.

## Item Row

Generic; rendered identically for every kind. PRD-141 swaps in a shopping-specific variant for `kind='shopping'`.

```
┌─────────────────────────────────────────────────────────────┐
│ [☐] 250g flour — Brownies                          [⋮]    │
│     ref: ingredient                                          │
└─────────────────────────────────────────────────────────────┘
```

- **Checkbox**: toggles `checked` via `lists.items.check` / `lists.items.uncheck`. Optimistic update.
- **Label** + qty/unit: from `list_items.label` (already denormalised at insert per PRD-112).
- **Sub-line** (optional): a small caption with the `ref_kind` chip for non-free items; the `notes` field excerpt if non-empty (truncated to 80 chars; tooltip shows full). Free items have no sub-line.
- **Three-dot menu**:
  - Edit (opens an inline editor for label / qty / unit / notes).
  - Move up / Move down (also accessible via drag).
  - Delete.

Checked items render with a strikethrough on the label and dimmed text. Order is preserved (checked items don't auto-move; PRD-141 may add a "sort checked to bottom" option for shopping).

Drag-to-reorder uses HTML5 drag-and-drop on desktop and a long-press + drag on mobile (per `react-dnd` or equivalent). Reorder calls `lists.items.reorder({ listId, orderedIds: [...] })` which UPDATEs `position` for the whole list in one transaction.

Editing an item label inline turns the row into a text input on click; pressing Enter saves (`lists.items.update({ id, label })`); Esc cancels. Mobile shows a full-width input below the row.

## tRPC API

```ts
// apps/pops-api/src/modules/lists/router.ts (new module — PRD-139 wires the manifest backend.router slot)
export const listsRouter = {
  list: {
    list: query({
      input: { kinds?: Array<'shopping' | 'packing' | 'todo' | 'generic'>, includeArchived?: boolean, sort?: 'updated' | 'name' | 'created' },
      output: { items: ListRow[] },
      // ListRow = { id, name, kind, ownerApp, itemCount, uncheckedCount, lastUpdatedAt, archivedAt? }
    }),
    get: query({
      input: { id: number },
      output: ListWithItems | null,
      // ListWithItems = { list: { id, name, kind, ownerApp, archivedAt? }, items: ListItemRow[] }
    }),
    create: mutation({
      input: { name: string, kind: 'shopping' | 'packing' | 'todo' | 'generic', ownerApp?: string },
      output: { id: number },
      // ownerApp defaults to 'user' when created from this UI; food's send action overrides to 'food'.
    }),
    update: mutation({
      input: { id: number, name?: string, kind?: 'shopping' | 'packing' | 'todo' | 'generic' },
      output: { ok: true } | { ok: false, reason: 'NotFound' | 'NameRequired' },
    }),
    archive: mutation({ input: { id: number }, output: { ok: true } }),
    unarchive: mutation({ input: { id: number }, output: { ok: true } }),
    delete: mutation({ input: { id: number }, output: { ok: true } }),
  },
  items: {
    add: mutation({
      input: { listId: number, label: string, qty?: number, unit?: string, refKind?: 'free' | 'ingredient' | 'variant' | 'recipe' | 'custom', refId?: number, notes?: string },
      output: { id: number, position: number },
    }),
    bulkAdd: mutation({
      input: { listId: number, items: ItemAddInput[] },
      output: { addedIds: number[] },
      // ItemAddInput = same shape as add() minus listId
    }),
    update: mutation({
      input: { id: number, label?: string, qty?: number | null, unit?: string | null, notes?: string | null },
      output: { ok: true },
    }),
    check: mutation({ input: { id: number }, output: { ok: true, checkedAt: string } }),
    uncheck: mutation({ input: { id: number }, output: { ok: true } }),
    remove: mutation({ input: { id: number }, output: { ok: true } }),
    reorder: mutation({
      input: { listId: number, orderedIds: number[] },
      output: { ok: true } | { ok: false, reason: 'BadIds' | 'NotFound' },
      // BadIds = orderedIds doesn't match the list's current items 1:1.
    }),
  },
};
```

All mutations are transactional. `reorder` runs a single `UPDATE list_items SET position = ?` per row inside one transaction.

### Router-to-service mapping

The tRPC router methods above wrap PRD-112's service methods one-to-one. The router uses verb-only names (`add`, `update`); PRD-112's service file uses `Item` / `List`-suffixed names. Mapping:

| Router (this PRD)      | Service (PRD-112)                                                                                                                                       | File                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `lists.list.list`      | (router-owned aggregate query)                                                                                                                          | `apps/pops-api/src/modules/lists/router.ts` (no service wrapper) |
| `lists.list.get`       | `getList`                                                                                                                                               | `packages/app-lists/src/db/services/lists.ts`                    |
| `lists.list.create`    | `createList`                                                                                                                                            | same                                                             |
| `lists.list.update`    | (router-owned update; PRD-112 has no `updateList` — service exposes archive/unarchive/delete only — add `updateList` to PRD-112's services during impl) | same                                                             |
| `lists.list.archive`   | `archiveList`                                                                                                                                           | same                                                             |
| `lists.list.unarchive` | `unarchiveList`                                                                                                                                         | same                                                             |
| `lists.list.delete`    | `deleteList`                                                                                                                                            | same                                                             |
| `lists.items.add`      | `addItem`                                                                                                                                               | `packages/app-lists/src/db/services/list-items.ts`               |
| `lists.items.bulkAdd`  | `bulkAdd`                                                                                                                                               | same                                                             |
| `lists.items.update`   | `updateItem`                                                                                                                                            | same                                                             |
| `lists.items.check`    | `checkItem`                                                                                                                                             | same                                                             |
| `lists.items.uncheck`  | `uncheckItem`                                                                                                                                           | same                                                             |
| `lists.items.remove`   | `removeItem`                                                                                                                                            | same                                                             |
| `lists.items.reorder`  | `reorderItems`                                                                                                                                          | same                                                             |

The router is a thin pass-through; business logic lives in the service. `lists.list.update` requires adding `updateList(id, { name?, kind? })` to PRD-112's `lists.ts` service — small additive amendment.

`bulkAdd` wraps PRD-112's `bulkAdd` service in a transaction. PRD-142 is the primary caller.

`list.get` is the main detail-page query and returns the full item set in one round-trip. Items are sorted by `position ASC, id ASC` (tie-break for unique-position-not-guaranteed per PRD-112's edge cases).

## Components

```
packages/app-lists/src/pages/
├── ListsIndexPage.tsx
├── ListDetailPage.tsx
├── ListNewModal.tsx
├── ListEditModal.tsx
├── components/
│   ├── ListRow.tsx               // index row
│   ├── ListItemRow.tsx           // generic item row
│   ├── ListItemAddForm.tsx       // bottom-of-list add input
│   ├── ListKindChip.tsx          // shopping / packing / todo / generic chip
│   ├── DeleteConfirmDialog.tsx
│   └── KindRadioGroup.tsx        // create/edit modal
```

PRD-141's shopping specialisation drops in alternate components (`ShoppingItemRow`, `ShoppingDetailHeader`) that the detail page swaps in when `kind === 'shopping'`.

## Business Rules

- All routes are mounted under `/lists` and require `lists` module installation (PRD-139).
- List names are non-empty; trimmed on input; max 200 chars (cosmetic cap; not enforced at schema layer).
- New list defaults `owner_app = 'user'`. Food's send action (PRD-142) creates with `owner_app = 'food'`.
- Archived lists never appear in the default index but are reachable via the "Show archived" toggle; can be unarchived from the detail-page action menu.
- Hard-delete cascades item rows via PRD-112's `deleteList` service (one transaction).
- Item adding via the inline form always lands at the bottom (`position = MAX(position) + 1`). The user can drag it up afterwards.
- Item label is required and non-empty.
- Optimistic updates on check / uncheck / reorder: UI updates immediately, mutation fires, on error rolls back + toast.
- The detail page polls `lists.list.get` every 60s while visible to pick up changes from other tabs / the food send action.
- Item reorder rejects when `orderedIds.length !== current item count` (defensive against stale state).
- Changing a list's `kind` does NOT modify items. Affordances change; data doesn't.
- `notes` field has a 500-char cap (cosmetic; not enforced at schema layer). UI shows a counter when approaching.

## Edge Cases

| Case                                                                                             | Behaviour                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| User creates a list with name = `"   "` (whitespace only)                                        | Trimmed server-side; rejected with `NameRequired`. UI disables Create until at least one non-whitespace char.                          |
| User reorders 50 items by dragging one across the list                                           | Single `reorder` call with all 50 IDs in the new order. One transaction.                                                               |
| User adds an item while another tab deleted the list                                             | `items.add` fails with `NotFound`. UI shows toast: "This list was deleted in another tab. Returning to /lists."                        |
| User checks an item while another tab uncheck'd it                                               | Last write wins (single-user). Both succeed sequentially; UI's optimistic state matches the latest mutation.                           |
| Detail page polling races with a local edit                                                      | React Query's stale-while-revalidate handles this; the local mutation is the source of truth until its response invalidates the cache. |
| User changes `kind='shopping'` → `kind='todo'` on a list with checked items                      | Items keep their `checked` state. Todo affordances render. Shopping-specific actions (PRD-141) disappear.                              |
| User drags an item to position 0 (top of list)                                                   | Reorder uses 0-indexed positions; first item is `position=0`.                                                                          |
| User deletes a list that food's send action would have targeted                                  | Food's UI has no awareness; next send picks from the remaining lists or offers Create. No automatic recovery.                          |
| `archive` on an already-archived list                                                            | Idempotent — `archived_at` updates to now. UI debounces.                                                                               |
| Reorder during a long-running drag, user releases over an empty area                             | UI cancels the reorder; nothing fires.                                                                                                 |
| List with 0 items and the user clicks "Sort: name ASC"                                           | Sort is a list-of-lists option (`list.list` query), not a within-list option. Within-list manual ordering only in v1.                  |
| User enters qty="3.5" and unit="cups" via the inline form                                        | Stored as `qty=3.5, unit='cups'`. Conversion is NOT applied here — PRD-142's aggregation is the only place conversion runs.            |
| User adds an item with `ref_kind='ingredient'` but `ref_id` doesn't resolve (deleted ingredient) | Per PRD-112, schema allows it; service inserts. UI shows a broken-ref icon. PRD-142 won't actually emit invalid refs.                  |
| Manual edit changes an item that food's send aggregated into                                     | Manual edit overrides. Next send treats it as a separate row (aggregation matches by `ref_kind/ref_id`, not by label). User's choice.  |

## Acceptance Criteria

Inline per theme protocol.

### Routes

- [~] All routes from the table mounted in `packages/app-lists/src/routes.tsx`. — `/lists/:id` landed in 140-C; `/lists` is still PRD-139's placeholder until 140-B replaces it with the real index.
- [ ] Modals overlay the parent route; URL params `?new=1` and `?edit=1` work; closing returns to the parent. — **Deferred to 140-B.** 140-C uses local component state for the edit + delete dialogs since the parent route (`/lists` index) is the modal host per the react-router-v6 nested-route plan; wiring `?edit=1` before 140-B exists would couple the detail page to a non-existent parent route. 140-B will introduce the parent layout + URL-param state and 140-C's modals will be re-wired then.
- [ ] Direct nav to a modal URL (e.g. `/lists/5?edit=1`) renders parent + modal. — **Deferred to 140-B** (same reason).

### Index page

- [ ] Renders ListRow for each list; click navigates to detail.
- [ ] Filter chips for kind work; "Show archived" toggle works.
- [ ] Sort dropdown: updated / name / created.
- [ ] Empty state copy matches spec.

### Detail page

- [x] Header shows name, kind chip, three-dot menu. (140-C)
- [x] Item list renders ordered by `position ASC, id ASC`. (140-C — backed by `lists.list.get` which sorts via `listItemsForList`)
- [x] Inline add form: Enter submits + clears; mobile add button works. (140-C)
- [x] Per-item: checkbox, label, optional sub-line, three-dot menu. (140-C)
- [x] Drag-to-reorder works on desktop and mobile. (140-C — `@dnd-kit/sortable` with PointerSensor + 200ms TouchSensor delay)
- [x] Inline label edit works (click → input → Enter saves; Esc cancels). (140-C)
- [x] Polling refetches `list.get` every 60s while page is visible. (140-C — `refetchInterval: 60_000, refetchIntervalInBackground: false`)

### Modals

- [ ] Create modal validates non-empty name; defaults kind to `shopping`; calls `lists.list.create`. — Lives on the index page; ships with 140-B.
- [x] Edit modal pre-fills; rename works; kind change works with warning. (140-C — local-state modal; URL-param wiring deferred to 140-B per the Routes section above)
- [x] Edit modal has Archive / Restore button. (140-C)
- [x] Delete confirm dialog requires explicit confirm; cancels safely. (140-C)

### tRPC procedures

- [x] All procedures in the API section exist in `apps/pops-api/src/modules/lists/router.ts`.
- [x] All mutations are transactional.
- [x] `lists.list.list` includes computed `itemCount`, `uncheckedCount`, `lastUpdatedAt`.
- [x] `lists.items.reorder` rejects if `orderedIds.length !== current count`.

### Manifest wiring

- [x] PRD-139's manifest gets its `backend.router` slot filled with `listsRouter` (this is the consumer side of PRD-139's frontend-only scope).

### Mobile

- [ ] All pages readable at 375px.
- [ ] Item rows tappable (44px target).
- [ ] Drag interactions work on touch.
- [ ] Modals occupy the full viewport on mobile.

### Tests

- [~] Vitest + RTL at `packages/app-lists/src/pages/__tests__/*.test.tsx` covers each page. — Detail page covered by `ListDetailPage.test.tsx` (140-C); index page coverage lands with 140-B.
- [x] Vitest integration at `apps/pops-api/src/modules/lists/__tests__/lists-router.test.ts` covers each procedure.
- [ ] E2E: create list → add 3 items → check one → reorder → archive → restore. — Spans index + detail; lands with 140-B once the index page exists.

## Out of Scope

- Shopping-specific affordances (uncheck-all, clear-checked, sort options) — **PRD-141**.
- Food-side send action — **PRD-142**.
- Section grouping inside a list — Epic 07.
- Item types beyond what PRD-112's `ref_kind` enum allows.
- Bulk select / bulk delete items within a list.
- Search across or within lists.
- Per-item images.
- Recurring lists / templates.
- Lists sharing.
- Cross-list operations (move item between lists, merge lists).
- Print view.
- Voice input.
- Item due-date UI even for `kind='todo'` (the schema has `due_at` but the v1 UI ignores it; future PRD adds the todo-specific affordances).
- `kind='packing'` / `kind='generic'` specialisations beyond what the generic path covers.
- `lists.items.uncheckAll` and `lists.items.removeChecked` mutations — added by **PRD-141** (this PRD's router shape is open-ended; PRD-141 extends `listsRouter.items` with these two).

## Requires (cross-PRD dependencies)

- **PRD-098** — module manifest shape (`backend.router`).
- **PRD-101** — per-module migration runner (lists' migrations are gated).
- **PRD-112** — `lists`, `list_items` schema + the `addItem`/`bulkAdd`/`reorderItems`/etc. service methods.
- **PRD-139** — module manifest shell that this PRD's router populates.
- Existing `@pops/api-client`, `@pops/navigation`, `@pops/ui` packages.
