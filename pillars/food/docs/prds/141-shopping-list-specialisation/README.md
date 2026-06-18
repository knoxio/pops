# PRD-141: Shopping List Specialisation

> Epic: [04 — Lists & Shopping](../../epics/04-lists-and-shopping.md)

## Overview

Layer shopping-specific UX on top of PRD-140's generic list detail page. When `list.kind === 'shopping'`, the detail page swaps in a richer header (uncheck-all, clear-checked, sort options) and a row component tuned for in-store interaction (large checkboxes, swipe-to-delete on mobile, qty/unit always visible). No new tables, no new tRPC procedures — pure UI specialisation that consumes PRD-140's API.

After this PRD, a user opens a shopping list on their phone in the supermarket and can tick items off with thumb-sized targets, batch-uncheck after the trip (preparing for next week), and clear bought items to focus on what's still on the list. Section grouping is **explicitly NOT in this PRD** — Epic 07 owns that.

## Specialised Components

PRD-140's detail page dispatches by `list.kind`:

```ts
// packages/app-lists/src/pages/ListDetailPage.tsx (PRD-140)
{list.kind === 'shopping'
  ? <ShoppingDetailHeader list={list} items={items} />
  : <GenericDetailHeader list={list} />}

{list.kind === 'shopping'
  ? items.map(item => <ShoppingItemRow item={item} key={item.id} />)
  : items.map(item => <ListItemRow item={item} key={item.id} />)}
```

This PRD owns `ShoppingDetailHeader`, `ShoppingItemRow`, and the supporting components below.

```
packages/app-lists/src/pages/components/shopping/
├── ShoppingDetailHeader.tsx
├── ShoppingItemRow.tsx
├── ShoppingSortDropdown.tsx
├── UncheckAllDialog.tsx
├── ClearCheckedDialog.tsx
└── ShoppingAddForm.tsx          // replaces generic add form for shopping kind
```

## `ShoppingDetailHeader`

Above PRD-140's three-dot menu, render a row of shopping actions:

- **Sort dropdown** — `Sort: Manual (default)` / `By unchecked first` / `By recently checked`. State is local (not persisted; resets on page reload).
- **`Uncheck all`** — button enabled iff at least one item is `checked`. Click opens `UncheckAllDialog` for confirm.
- **`Clear checked`** — button enabled iff at least one item is `checked`. Click opens `ClearCheckedDialog` for confirm.
- A small caption: `"N items · M checked"`.

The header is mobile-first: on screens < 480px, the sort dropdown collapses into an icon, and `Uncheck all` / `Clear checked` move into the three-dot menu PRD-140 already renders.

### Sort behaviours

- **Manual (default)**: items render in `position ASC` order (PRD-140's default).
- **By unchecked first**: items sort `checked ASC, position ASC` — unchecked items appear at the top, checked at the bottom. Useful in-store: what's left to buy is up top.
- **By recently checked**: items sort `checked DESC, checked_at DESC` — most-recently-checked at the top. Useful for "what did I just put in the cart?" double-checks.

Sort changes are client-side only — no API round-trip; reorder rules (PRD-140's `lists.items.reorder`) still write `position` based on manual drags only.

### Uncheck-all confirm

```
Uncheck all items?
This resets the checked state for N items. The list itself isn't modified.
[Cancel] [Uncheck all]
```

On confirm, calls a new `lists.items.uncheckAll` mutation (see API additions below).

### Clear-checked confirm

```
Remove all checked items?
This permanently deletes N items from this list. The unchecked items stay.
[Cancel] [Remove checked]
```

On confirm, calls a new `lists.items.removeChecked` mutation. Optimistic — items disappear immediately; rollback on error.

## `ShoppingItemRow`

Replaces PRD-140's `ListItemRow` for `kind='shopping'`. Same data, denser/touch-tuned UX.

```
┌────────────────────────────────────────────────────────────────┐
│  ┌──┐                                                          │
│  │☐ │   250 g     Flour                              [⋮]      │
│  └──┘             Brownies, Pancakes                            │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

Differences from the generic row:

- **Checkbox is 32×32px** (vs ~20×20 in the generic row). Tappable target is 44×44 including padding (matches accessibility floor).
- **Qty + unit always visible** (vs hidden-unless-set in the generic row), even when empty (shows `—` to keep alignment).
- **Sub-line** shows the `notes` field as the primary content (typically the recipe names that contributed to this item). For free items without notes, sub-line is hidden.
- **Swipe-to-delete on mobile** (touch only): swipe a row left to reveal a Delete action. Requires explicit tap of the Delete button — single-stroke gestures don't delete to prevent accidents.
- **Tap the row body** (not the checkbox) opens the inline edit mode PRD-140 specifies. The checkbox is the dominant interaction; tap-to-edit is secondary.
- **Long-press** on touch starts a drag (PRD-140's reorder).

Checked items: strikethrough on the label, opacity 60%, qty/unit greyed out. Sub-line stays at full opacity (the recipe provenance is still useful when reviewing what's bought).

## `ShoppingAddForm`

Replaces PRD-140's add form for `kind='shopping'`. Differences:

- **Qty + unit fields visible by default** (vs collapsed in the generic form).
- **Field order**: `[qty] [unit] [label]` — qty first because that's the most common starting point ("3 apples", "1L milk").
- **Unit suggestions**: a dropdown next to the unit field lists common units (`g`, `kg`, `ml`, `l`, `count`, `bunch`, `pack`, `box`). User can also type a free-form unit.
- **Enter still submits**; cursor returns to the qty field (not the label) for fast multi-item entry.

The form remains a single-row input; it does NOT pre-open a multi-line "add several items" surface (that's how PRD-142 batches).

## tRPC API Additions

Two new mutations added to PRD-140's `listsRouter.items`:

```ts
// extends apps/pops-api/src/modules/lists/router.ts (PRD-140)
uncheckAll: mutation({
  input: { listId: number },
  output: { ok: true, count: number },  // count = how many items were unchecked
}),

removeChecked: mutation({
  input: { listId: number },
  output: { ok: true, removedCount: number },
}),
```

Both run in a single transaction. `uncheckAll` UPDATEs all `list_items WHERE list_id = ? AND checked = 1` to `checked = 0, checked_at = NULL` in one statement. `removeChecked` DELETEs all `list_items WHERE list_id = ? AND checked = 1`.

These mutations are kind-agnostic at the API level — they work on any list. The UI only exposes them for `kind='shopping'`, but a future packing-list spec could wire them up too.

## Business Rules

- Specialisation activates strictly on `list.kind === 'shopping'`. If the kind changes (PRD-140's edit modal), the specialised header/rows swap in/out without losing data (items keep their state).
- Sort settings are session-local — not stored on the list, not in URL. A fresh page load defaults to Manual.
- Sort order does NOT modify `position` values. Drag-to-reorder always writes new `position` ints; sort is a render-time transform.
- Drag-to-reorder is **disabled** when sort mode is non-Manual (the drag handle is greyed out with a tooltip "Switch to Manual sort to reorder"). Reordering in a non-Manual view would have no visible effect because the sort would immediately re-assert; we forbid the gesture so the user isn't surprised. Switching back to Manual exposes the new `position` values written by past drags.
- `Uncheck all` and `Clear checked` always operate on the WHOLE list, never on a filtered subset (no filters in v1).
- Optimistic updates for `uncheckAll` and `removeChecked`: UI updates immediately; rollback on server error.
- Tapping a checked item's checkbox unchecks it (idempotent toggle); standard PRD-140 behaviour.

## Edge Cases

| Case                                                                            | Behaviour                                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| User clicks Uncheck all on a list with 0 checked items                          | Button is disabled with a tooltip ("No items to uncheck").                                                                    |
| User clicks Clear checked on a list with 0 checked items                        | Button is disabled.                                                                                                           |
| User sorts "by unchecked first" and tries to drag a row                         | Drag is disabled (handle greyed). Tooltip: "Switch to Manual sort to reorder." User toggles back to Manual then drags freely. |
| User changes kind from `shopping` to `todo` while header is visible             | PRD-140's kind change cascades; on next render, the header swaps to generic. Selection / sort state is lost.                  |
| User swipes a row partially then taps elsewhere                                 | Swipe state cancels; row snaps back. No mutation.                                                                             |
| Network drops during Uncheck all                                                | Optimistic UI rolls back after timeout; toast: "Couldn't uncheck items — try again."                                          |
| Two users (single-user-mode, but two browser tabs) Clear checked simultaneously | Both DELETE statements run; the second is a no-op (zero matching rows). Both UIs converge.                                    |
| List has 200 unchecked items                                                    | Sort "by unchecked first" still renders them all; PRD-140 doesn't paginate within a list (lists stay small in v1).            |
| Mobile swipe-to-delete on a checked item                                        | Works the same; deletes the item.                                                                                             |
| User starts a drag, then swipes (touch conflict)                                | Long-press detection wins (drag); swipe is suppressed during a drag.                                                          |
| Sort dropdown opens off-screen on mobile                                        | Dropdown opens upward when near the viewport bottom (CSS-only behaviour; no JS positioning).                                  |
| User checks an item, sort is "by unchecked first" → item jumps to the bottom    | Expected. UI applies a 200ms fade animation so the move is visible.                                                           |

## Acceptance Criteria

Inline per theme protocol.

### Header

- [ ] `ShoppingDetailHeader` renders only when `list.kind === 'shopping'`.
- [ ] Sort dropdown offers Manual / By unchecked first / By recently checked.
- [ ] `Uncheck all` button enabled iff `checked > 0`.
- [ ] `Clear checked` button enabled iff `checked > 0`.
- [ ] Caption shows `"N items · M checked"` and updates on item state changes.
- [ ] Mobile (< 480px): sort collapses to icon; uncheck-all and clear-checked move to the three-dot menu.

### Row

- [ ] `ShoppingItemRow` renders 32px checkbox with 44px tap target.
- [ ] Qty + unit always visible; `—` shown when null.
- [ ] Sub-line shows `notes` for items where it's non-empty.
- [ ] Tap on row body opens inline edit (PRD-140's mechanism).
- [ ] Tap on checkbox toggles checked.
- [ ] Long-press on touch starts a drag.
- [ ] Swipe-left on touch reveals Delete; tapping Delete confirms.
- [ ] Checked items render with strikethrough + 60% opacity.

### Add form

- [ ] `ShoppingAddForm` shows `[qty] [unit] [label]` in that order.
- [ ] Unit dropdown suggests common units; free-text entry also works.
- [ ] Enter submits and returns cursor to the qty field.

### Mutations

- [ ] `lists.items.uncheckAll` exists in `apps/pops-api/src/modules/lists/router.ts` and runs as one statement.
- [ ] `lists.items.removeChecked` exists and runs as one statement.
- [ ] Both return the row count affected.
- [ ] Optimistic UI updates with rollback on failure.

### Behaviour

- [ ] Sort modes apply client-side; reordering writes `position` via PRD-140's reorder mutation.
- [ ] Sort settings reset on page reload.
- [ ] Kind change to non-shopping cleanly swaps the UI without losing item data.

### Tests

- [ ] Vitest + RTL at `packages/app-lists/src/pages/components/shopping/__tests__/*.test.tsx` covers each component.
- [ ] Vitest integration at `apps/pops-api/src/modules/lists/__tests__/items-bulk-mutations.test.ts` for `uncheckAll` and `removeChecked`.
- [ ] E2E: shopping list with 5 items → check 3 → uncheck-all → clear-checked → 5 remain → check 2 → clear-checked → 3 remain.

### Mobile

- [ ] Touch interactions (tap, long-press, swipe) work on real iOS Safari and Android Chrome (manual verification documented).
- [ ] All controls reachable with one thumb on a 6.1" phone.

## Out of Scope

- Section grouping inside a list — Epic 07.
- Pantry-aware "what do I still need?" subtraction — Epic 07.
- Plan-derived list generation — Epic 07 (depends on Epic 05).
- Persistent sort preference per list — out of scope; session-local only.
- Per-item recipe provenance UI beyond what `notes` displays — out of scope.
- Bulk select for non-checked items (multi-select to delete a few) — out of scope; per-row swipe-delete suffices.
- Receipt scanning to auto-check items — out of scope; future cross-domain with finance.
- Shareable shopping lists ("send my partner a link") — single-user system.
- Quantity arithmetic in the row UI (a +/- button to bump qty) — out of scope; inline edit covers it.
- A "shopping mode" full-screen view (no shell chrome) — out of scope; the regular detail page works on mobile.

## Requires (cross-PRD dependencies)

- **PRD-112** — `list_items.checked`, `list_items.checked_at` columns; `position` column for drag-reorder.
- **PRD-139** — module manifest; this PRD's components live in the package PRD-139 wires up. If swipe gestures require `react-swipeable` (or equivalent), PRD-139's `package.json` is amended at implementation time to include it.
- **PRD-140** — Two amendments required:
  - **(a)** `listsRouter.items` gains `uncheckAll` and `removeChecked` mutations (see "tRPC API Additions"). PRD-140's spec enumerates `add`/`bulkAdd`/`update`/`check`/`uncheck`/`remove`/`reorder` and is silent on these two — implementation imports them from this PRD.
  - **(b)** `ListDetailPage` dispatches by `list.kind === 'shopping'` to swap in this PRD's specialised header, item row, and add form. PRD-140's spec already anticipates this dispatch in its "Item Row" section; this PRD owns the actual replacement components.
