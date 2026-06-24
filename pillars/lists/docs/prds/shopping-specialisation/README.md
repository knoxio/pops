# Shopping list specialisation

## Purpose

The `kind='shopping'` UX layer on top of the generic
[crud-ui](../crud-ui/README.md) detail page. When a list's `kind` is `shopping`,
the detail page swaps in a richer header (uncheck-all, clear-checked, sort
modes) and a touch-tuned row (large checkbox, qty/unit always visible,
swipe-to-delete). It is pure frontend specialisation plus two bulk endpoints —
no new tables.

The target use case: a user opens a shopping list on their phone in a
supermarket, ticks items off with thumb-sized targets, batch-unchecks after the
trip to prep for next week, and clears bought items to focus on what's left.
Section grouping is **not** part of this — it is a separate, unbuilt direction
(see [ideas](../../ideas/)).

## Dispatch

`ListDetailPage` branches on `list.kind`. For `shopping` it renders the
shopping content tree; every other kind renders the generic tree.

```
pages/components/shopping/
├── ShoppingDetailContent.tsx   # the shopping detail body
├── ShoppingDetailHeader.tsx    # action header (sort, uncheck-all, clear-checked)
├── ShoppingItemsSection.tsx    # the item list, sort-aware
├── ShoppingItemRow.tsx         # touch-tuned row
├── ShoppingRowBody.tsx
├── ShoppingSortDropdown.tsx
├── ShoppingAddForm.tsx         # replaces the generic add form
├── UncheckAllDialog.tsx
├── ClearCheckedDialog.tsx
├── SwipeDeleteAction.tsx
├── unit-suggestions.ts
└── use{ShoppingSort,ShoppingEdit,ShoppingBulkMutations,SwipeDelete}.ts
```

## Shopping detail header

Renders only for `kind='shopping'`:

- **Sort dropdown** (`ShoppingSortDropdown`): Manual (default) / By unchecked
  first / By recently checked. State is session-local — not persisted, resets on
  reload.
- **Uncheck all** — enabled iff at least one item is checked; opens
  `UncheckAllDialog`.
- **Clear checked** — enabled iff at least one item is checked; opens
  `ClearCheckedDialog`.
- A caption: `"N items · M checked"`.

### Sort behaviours (client-side, `useShoppingSort`)

- **Manual** — `position ASC` (the generic default).
- **By unchecked first** — `checked ASC, position ASC`; what's left to buy is on
  top.
- **By recently checked** — `checked DESC, checked_at DESC`; most-recently-checked
  on top for a "what did I just put in the cart?" double-check.

Sorting is a render-time transform; it never writes `position`. Drag-to-reorder
(which does write `position` via the generic `reorder` endpoint) is **disabled**
in non-Manual modes — the handle is greyed with a tooltip — because the sort
would immediately re-assert and the drag would have no visible effect.

### Uncheck-all

`UncheckAllDialog` confirms, then calls `POST /lists/:listId/items/uncheck-all`,
which sets every checked item in the list back to `checked=0, checked_at=NULL` in
one statement and returns `{ ok: true, count }`. Optimistic; rolls back on error.

### Clear-checked

`ClearCheckedDialog` confirms, then calls
`DELETE /lists/:listId/items/checked`, which hard-deletes every checked item in
one statement and returns `{ ok: true, removedCount }`. Optimistic — rows
disappear immediately; rollback on error.

Both bulk endpoints are kind-agnostic at the API level; only the shopping UI
surfaces them today.

## Shopping item row (`ShoppingItemRow`)

Same data as the generic row, denser and touch-tuned:

- **Larger checkbox** with a ≥44px tap target.
- **Qty + unit always visible**, even when null (shows `—` for alignment).
- **Sub-line** shows the `notes` field as primary content (typically the recipe
  provenance for food-sent items). Hidden for free items without notes.
- **Swipe-left on touch** reveals a Delete action (`SwipeDeleteAction`,
  `useSwipeDelete`); deletion requires an explicit tap of Delete — a single swipe
  never deletes, to avoid accidents.
- **Tap the row body** opens the inline edit; the checkbox is the dominant
  interaction.
- **Long-press on touch** starts a drag (the generic reorder).
- Checked items: struck-through label, dimmed; the sub-line stays full-opacity so
  recipe provenance is still readable.

## Shopping add form (`ShoppingAddForm`)

Replaces the generic add form for shopping:

- Qty + unit visible by default; field order `[qty] [unit] [label]` (qty first —
  "3 apples", "1L milk").
- A unit-suggestion list (`unit-suggestions.ts`) offers common units; free-text
  entry also works.
- Enter submits and returns the cursor to qty for fast multi-item entry.

## Rules

- The specialisation activates strictly on `list.kind === 'shopping'`. If the
  kind changes, the header/rows swap in or out without losing item data.
- Sort settings are session-local — not stored on the list, not in the URL; a
  fresh load defaults to Manual.
- Sort never mutates `position`; only drag-to-reorder does.
- Drag-to-reorder is disabled while a non-Manual sort is active.
- Uncheck-all and clear-checked always operate on the whole list (no filters).
- Uncheck-all and clear-checked are optimistic with rollback on error.

## Edge cases

| Case                                               | Behaviour                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Uncheck-all with 0 checked items                   | Button disabled.                                                                        |
| Clear-checked with 0 checked items                 | Button disabled.                                                                        |
| Drag while a non-Manual sort is active             | Drag disabled (handle greyed, tooltip); switch back to Manual to reorder.               |
| Kind changes `shopping` → `todo`                   | Header/rows swap to generic on next render; sort state is lost; item data is untouched. |
| Swipe a row partially, tap elsewhere               | Swipe cancels; row snaps back; no mutation.                                             |
| Network drops during uncheck-all / clear-checked   | Optimistic UI rolls back; toast surfaces the failure.                                   |
| Two tabs clear-checked simultaneously              | Both DELETEs run; the second matches zero rows; both UIs converge.                      |
| Check an item while "by unchecked first" is active | The item moves to the bottom on re-sort (animated).                                     |

## Acceptance criteria

### Header

- [x] `ShoppingDetailHeader` renders only when `list.kind === 'shopping'`.
- [x] Sort dropdown offers Manual / By unchecked first / By recently checked
      (`ShoppingSortDropdown`, `useShoppingSort`).
- [x] Uncheck-all enabled iff `checked > 0`.
- [x] Clear-checked enabled iff `checked > 0`.
- [x] Caption shows `"N items · M checked"`.

### Row

- [x] `ShoppingItemRow` renders a large checkbox with a ≥44px tap target.
- [x] Qty + unit always visible; `—` shown when null.
- [x] Sub-line shows `notes` when non-empty.
- [x] Tap on row body opens inline edit; tap on checkbox toggles checked.
- [x] Long-press on touch starts a drag.
- [x] Swipe-left on touch reveals Delete; an explicit tap confirms
      (`SwipeDeleteAction`, `useSwipeDelete`).
- [x] Checked items render struck-through and dimmed.

### Add form

- [x] `ShoppingAddForm` shows `[qty] [unit] [label]` in that order.
- [x] Unit dropdown suggests common units (`unit-suggestions.ts`); free-text
      entry also works.
- [x] Enter submits and returns the cursor to the qty field.

### Bulk endpoints

- [x] `POST /lists/:listId/items/uncheck-all` unchecks every checked item in one
      statement and returns `{ ok: true, count }`.
- [x] `DELETE /lists/:listId/items/checked` hard-deletes every checked item in
      one statement and returns `{ ok: true, removedCount }`.
- [x] Both are wired through `useShoppingBulkMutations` with optimistic updates
      and rollback on failure.

### Behaviour

- [x] Sort modes apply client-side; reorder still writes `position` via the
      generic reorder endpoint.
- [x] Sort resets on page reload.
- [x] A kind change away from `shopping` swaps the UI without losing item data.

### Tests

- [x] `useShoppingSort` covered by
      `pages/components/shopping/__tests__/useShoppingSort.test.ts`.
- [x] Shopping detail content covered by
      `pages/components/shopping/__tests__/ShoppingDetailContent.test.tsx`.
      </content>
