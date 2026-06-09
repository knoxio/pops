# PRD-142: Recipe Send-to-List Action

> Epic: [04 — Lists & Shopping](../../epics/04-lists-and-shopping.md)

## Overview

The food-side button that turns a recipe's ingredient list into shopping-list items. Lives in PRD-119's `RecipeDetailPage` action menu on the recipe detail page (the menu that already hosts Edit / Drafts / Archive). Opens a picker modal (existing shopping list or new), respects the page's current scale factor, aggregates lines by `(ingredient_id, variant_id, canonical_unit)` summing canonical quantities, drops `prep_state` from the grouping key, and either merges into existing list items or appends fresh ones via PRD-140's `lists.items.bulkAdd`.

After this PRD, a user viewing "Chicken Tikka Masala (×4)" on `/food/recipes/chicken-tikka-masala` clicks "Send to shopping list" → picks "This week's groceries" → sees a confirmation toast → opens `/lists/<id>` on their phone and the ingredients are there with `4×` quantities, deduplicated against what's already on the list.

This is a food-domain PRD that consumes the `app-lists` API via `@pops/api-client` per PRD-139's cross-module boundary rule. No static imports of `@pops/app-lists` from `@pops/app-food`.

## UI

### Send button

Lives in PRD-119's `RecipeDetailPage` top-right action menu (the menu PRD-119 already declares with Edit / Drafts / Archive). PRD-121's `RecipeRenderer` is pure presentation (props only) and does NOT host an action menu — this is a PRD-119 amendment, not a PRD-121 change. Adds a new entry:

```
[ ⋮ ] menu:
  Edit
  Drafts (3)
  ──────────────
  Send to shopping list...        ← NEW
  ──────────────
  Archive
```

The label always ends in `...` because clicking opens a modal (HIG convention).

Disabled (with tooltip) when:

- The recipe has 0 ingredient lines (`recipe_lines` count is 0). Tooltip: "This recipe has no ingredients to send."
- The `lists` module is not installed. Tooltip: "Install the `lists` module to use this action." (Detection via the module registry — runtime check, not a static import.)

### Send picker modal

```
┌─────────────────────────────────────────────────────────┐
│ Send to shopping list                              [×]  │
├─────────────────────────────────────────────────────────┤
│  Sending "Chicken Tikka Masala" (4× scale)              │
│  12 ingredient lines · 9 canonical · 3 unconverted      │
│                                                          │
│  ○ Add to existing list:                                │
│    ┌──────────────────────────────────────────────────┐ │
│    │ This week's groceries — 14 items · 2h ago      │ │
│    │ Weekend BBQ — 7 items · 3d ago                  │ │
│    │ Pantry restock — 22 items · 1w ago              │ │
│    └──────────────────────────────────────────────────┘ │
│                                                          │
│  ● Create new list:                                     │
│    Name: [Shopping list — 2026-06-08              ]   │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│  Preview (9 items):                                     │
│    • 1000 g chicken breast (diced)                      │
│    • 800 g onion (sliced)                               │
│    • 240 ml double cream                                │
│    • 12 g garam masala                                  │
│    • ...6 more                                          │
│  Unconverted (3 items will be sent verbatim):           │
│    • 2 tbsp ghee                                        │
│    • 4 large cloves garlic                              │
│    • 1 thumb ginger                                     │
│                                                          │
│              [Cancel]              [Send 12 items]      │
└─────────────────────────────────────────────────────────┘
```

Behaviour:

- **Existing-list radio**: lists shopping-kind lists from `lists.list.list({ kinds: ['shopping'], includeArchived: false, sort: 'updated' })`. Each row shows name, item count, relative update time. Disabled when no shopping lists exist (radio is grey with a "No shopping lists yet" hint).
- **Create-new radio**: text input prefilled with `"Shopping list — <yyyy-MM-dd>"` per Epic 04's naming default. Editable.
- **Preview** section: shows what will be sent. Canonical items show the merged qty + unit + label. Unconverted items show their original text. "...N more" collapses long lists; clicking expands. The preview is purely informational — no per-item exclusion in v1.
- **Already-sent warning**: if the modal detects this recipe was sent to the selected (existing) list before — via the heuristic `notes LIKE '%<recipe-name>%'` on any matching `list_items` — show a yellow inline "Already sent" badge on the affected row in the existing-list picker. Doesn't block; just informs. (v1 ships the per-row badge; the "last sent on <date>" banner the original mockup showed was dropped — keeping the soft warning as a row-inline indicator avoids carrying a separate `lastSentAt` column through the wire shape for a state the user already sees in the relative update time next to the list.)
- **Send button** label dynamically shows the count (`Send 12 items`). Disabled while the picker modal is still loading initial data.
- **Sending state**: button shows a spinner; on success closes the modal and shows a global toast `"Sent 12 items to <list name>. View list."` (the "View list" link navigates to `/lists/<id>`). On error: inline error in the modal; modal stays open so the user can retry.

### Scale-factor read

The modal reads `scaleFactor` from the page's current state. When `scaleFactor=4`, the preview multiplies; the actual `bulkAdd` call sends the scaled qty.

PRD-121's renderer accepts `scaleFactor` as a prop (pure presentation, no state). The scale state actually lives on PRD-119's `RecipeDetailPage` (the page owns the scale-factor UI controls and passes the value down to `RecipeRenderer`). This PRD requires a **PRD-119 amendment**:

- Introduce a `RecipeScaleProvider` React context on `RecipeDetailPage` that holds the current `scaleFactor` and a setter.
- Export a `useRecipeScale(): { scaleFactor: number; setScaleFactor: (n: number) => void }` hook from `@pops/app-food` for consumers under the provider.
- `RecipeRenderer` continues to receive `scaleFactor` as a prop; `RecipeDetailPage` pulls it from the hook to feed the renderer.
- The send modal mounts under the same provider and reads `scaleFactor` via the same hook.

This keeps PRD-121's pure-presentation contract intact while letting sibling components (the action-menu modal) read the same scale value the renderer is using.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends recipesRouter from PRD-119)
food.recipes.prepareSendToList: query({
  input: { versionId: number, scaleFactor?: number },  // versionId, not slug, to pin to an exact version
  output: SendPreview,
});

food.recipes.sendToList: mutation({
  input: {
    versionId: number,
    scaleFactor?: number,
    target:
      | { kind: 'existing'; listId: number }
      | { kind: 'new'; name: string },
  },
  output:
    | { ok: true, listId: number, addedCount: number, mergedCount: number }
    | { ok: false, reason: SendToListError },
});

export type SendPreview = {
  recipeTitle: string;
  scaleFactor: number;
  canonicalItems: PreviewItem[];        // post-aggregation, post-scale
  unconvertedItems: PreviewItem[];      // recipe_lines with null qty_g/ml/count
  alreadySentToListIds: number[];        // shopping-list IDs whose notes mention this recipe
};

export type PreviewItem = {
  label: string;                         // computed: "1000 g chicken breast (diced)"
  qty: number | null;
  unit: string | null;                   // 'g' | 'ml' | 'count' for canonical; original unit for unconverted
  ingredientId: number;
  variantId: number | null;
  prepStateLabel: string | null;         // human-readable prep state for the label, e.g. "diced"
  sourceLineIds: number[];               // recipe_lines.id values that aggregated into this row
};

export type SendToListError =
  | 'RecipeNotFound'
  | 'NoIngredients'                      // recipe has 0 lines
  | 'TargetListNotFound'
  | 'TargetListArchived'
  | 'TargetListNotShopping'              // existing list with kind != 'shopping' — rejected
  | 'NameRequiredForNew'
  | 'CompileNotReady';                   // versionId's compile_status != 'compiled'
```

### `prepareSendToList` server-side flow

1. Verify the version exists and `compile_status='compiled'`. Else `CompileNotReady` or `RecipeNotFound`.
2. Read `recipe_versions.title`, `recipe_lines` for the version, parent recipe's `slug`.
3. Default `scaleFactor` to 1 if not provided; clamp to >0 (treat 0 / negative as 1, matching PRD-121's defensive behaviour).
4. Group `recipe_lines` by `(ingredient_id, variant_id, canonical_unit)`. Sum `qty_g | qty_ml | qty_count` × `scaleFactor` per group. Drop `prep_state_id` from the grouping key, but collect distinct prep-state slugs per group for the label.
5. Lines with all three canonical qty fields null go into `unconvertedItems` (one row per line — no aggregation; PRD-116 didn't normalise them).
6. Compute each `PreviewItem.label`:
   - Canonical: `"<qty> <unit> <ingredient_name>[ <variant_name>][ (<prep_states joined with ', '>)]"`. e.g. `"1000 g chicken breast (diced)"`. Lookup `ingredients.name` and `ingredient_variants.name` from PRD-106.
   - Unconverted: `"<original_qty> <original_unit> <ingredient_name>[ <variant_name>][ (<prep_state>)]"`. e.g. `"2 tbsp ghee"`.
7. For each shopping list (any `kind='shopping'`, non-archived), check if any of its `list_items.notes` contains the recipe's `recipe_versions.title`. Return matching list IDs as `alreadySentToListIds`.

### `sendToList` server-side flow

1. Run the same preview logic (steps 1-6 above).
2. Resolve target list:
   - `kind='existing'`: SELECT the list, verify `kind='shopping'` and `archived_at IS NULL`. Else `TargetListArchived` / `TargetListNotShopping` / `TargetListNotFound`.
   - `kind='new'`: trim `name`; reject empty with `NameRequiredForNew`. Call `lists.list.create({ name, kind: 'shopping', ownerApp: 'food' })`. Use the returned id.
3. For each `PreviewItem`:
   - Search target list for an existing `list_items` row with same `(ref_kind, ref_id)` (where `ref_kind='variant'` if `variantId` is non-null, else `'ingredient'`).
     - **Match found**: UPDATE `qty = qty + new_qty`, append recipe-title + prep-states to `notes` (separator: `; `; cap total notes at 500 chars — truncate oldest with `…`), regenerate `label` from updated qty + unit + ingredient name. Track for `mergedCount`.
     - **No match**: INSERT a new row matching PRD-140's `addItem`/`bulkAdd` row shape — `label`, `qty`, `unit`, `ref_kind`, `ref_id`, `notes = recipe-title[ + ', prep']`, `position = MAX(position) + 1` per item (each new item gets the next sequential position). The implementation calls `addItem(tx, ...)` per row rather than the batch `bulkAdd(tx, listId, items[])` helper because the loop interleaves merges and inserts under a single drizzle transaction — same row shape, same one-tx guarantee. Track for `addedCount`.
4. All inserts and updates run in one Drizzle transaction.
5. Return `{ ok: true, listId, addedCount, mergedCount }`.

`addedCount` + `mergedCount` reflect the canonical + unconverted items combined.

## Why no live unit conversion at send

PRD-116 already wrote canonical `qty_g | qty_ml | qty_count` to each `recipe_lines` row at compile time. The send action reads those. **There is no second conversion pass.** This:

- Keeps PRD-142's logic independent of PRD-123's services at runtime.
- Means a recipe that was compiled before PRD-123 landed (i.e. with identity-or-null normalisation per PRD-116 v1) will appear here with many unconverted lines — that's expected; re-saving the recipe after PRD-123 lands re-compiles and improves coverage.
- Aggregation across recipes converts implicitly: every recipe's lines were normalised to the same canonical unit by their respective compiles. Different recipes producing different canonical units for the same ingredient (e.g. "flour" as `g` in one, `ml` in another) would NOT merge — they'd appear as separate items. In practice, PRD-106's `default_unit` per ingredient enforces consistency.

## Business Rules

- The send action is per-recipe-version, not per-recipe. Pins to the version the user is currently viewing.
- `scaleFactor` defaults to 1 if not passed; clamped to >0 (negative/zero → 1).
- Lines with `optional=true` (PRD-116's flag) are **included** in the send by default. Future PRD may add a checkbox to exclude optional ingredients; v1 sends everything.
- Aggregation grouping key is `(ingredient_id, variant_id, canonical_unit)`. `prep_state` is dropped from the key but collected in the label for context.
- Merging into an existing item: matches on `(ref_kind, ref_id)`, NOT on label. A list item with a hand-edited label still merges as long as its ref is intact.
- Unconverted items never merge — each unconverted line becomes a fresh row. (Risk of accumulating "2 tbsp ghee" + "2 tbsp ghee" = two rows; acceptable in v1.)
- `notes` field carries the recipe title (plus distinct prep-state slugs in parens) per merge / new row. Repeated sends append; 500-char cap truncates oldest with `…`.
- Cancel mid-flight: closing the modal during the `sendToList` round-trip does NOT cancel the server work. The list will reflect the send on next refresh. (Single-user; rare edge case.)
- Send-to-new always uses `kind='shopping'` and `owner_app='food'`. The user can rename / archive later via PRD-140 / PRD-141.
- The picker modal does NOT show non-shopping lists (todo, packing, generic). Future PRD may relax this if a use case emerges.
- The "already sent" detection is a soft warning — never blocks the send.

## Edge Cases

| Case                                                                                                           | Behaviour                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe has all unconvertible units (no PRD-123 coverage)                                                       | `canonicalItems = []`, `unconvertedItems = [all lines]`. Modal still works; preview shows all-unconverted. Send still inserts as free items with original qty + unit.                                                                                 |
| Recipe has 100 ingredient lines                                                                                | Aggregation groups likely collapse to <20 items. Preview shows first 5; "...95 more" expander; modal stays usable.                                                                                                                                    |
| User sends recipe at `scaleFactor=4`, then again at `scaleFactor=1` to the same list                           | Second send merges; existing rows have their qty increased by 1× more (5× total). User got what they asked for.                                                                                                                                       |
| Two recipes both yield items for `ingredient=flour`                                                            | Aggregation is per-send (per single recipe). The second send merges into the existing rows from the first. Final qty = sum.                                                                                                                           |
| Ingredient was renamed between sends                                                                           | `label` is regenerated server-side on each merge, so it reflects the current ingredient name. PRD-112's "label denormalised" rule is preserved per-send.                                                                                              |
| Target list deleted in another tab between Prepare and Send                                                    | `sendToList` returns `TargetListNotFound`. UI surfaces error; user picks a different list or creates new.                                                                                                                                             |
| Target list archived in another tab                                                                            | Returns `TargetListArchived`. UI surfaces.                                                                                                                                                                                                            |
| User opens modal on a recipe with `compile_status='failed'`                                                    | Modal opens but Send is disabled with tooltip "Recipe must compile cleanly first. Open the editor to fix errors." `prepareSendToList` returns `CompileNotReady` if attempted.                                                                         |
| Lists module isn't installed                                                                                   | Send button is disabled (PRD-139's edge case row covers).                                                                                                                                                                                             |
| User picks "Create new" with empty name                                                                        | UI disables Send button. Server-side `NameRequiredForNew` defends.                                                                                                                                                                                    |
| Ingredient line has `variantId=null` AND another has same `ingredientId` with `variantId=5`                    | They DON'T merge (different grouping keys). Two separate items.                                                                                                                                                                                       |
| Optional lines in the recipe                                                                                   | Sent like any other line. User can manually remove from the list afterwards.                                                                                                                                                                          |
| Recipe yields the same `ingredient_id` from two different lines (e.g. "200g flour" + "200g flour for dusting") | Aggregation merges them into one `400 g flour` item; prep-state distinguishes if PRD-116 captured one as "for dusting" via prep_state — but prep is dropped from the grouping key, so they merge anyway. notes collects both prep states. Acceptable. |
| `notes` would exceed 500 chars after merge                                                                     | Truncate from the front of the existing notes (oldest entries lost); prepend `…` so the user knows truncation happened.                                                                                                                               |
| Recipe's title contains `%` or `_` characters                                                                  | Server-side escapes them before the parameterised LIKE. Default SQLite LIKE remains case-insensitive for ASCII; the warning is informational and false-positives are acceptable in v1.                                                                |
| User clicks Send twice rapidly                                                                                 | UI debounces the button (disabled during pending mutation). Server-side dedup is not needed because each call is a fresh INSERT/UPDATE pair.                                                                                                          |

## Acceptance Criteria

Inline per theme protocol.

### Button

- [ ] PRD-119's `RecipeDetailPage` action menu gains a "Send to shopping list..." entry between Drafts and Archive (PRD-119 amendment).
- [ ] Entry is disabled with explicit tooltips when (a) `recipe_lines` count is 0 OR (b) `lists` module not installed OR (c) `compile_status !== 'compiled'`.

### Modal

- [ ] Opening the modal calls `food.recipes.prepareSendToList` and renders the preview within 500ms (warm-cache target).
- [ ] Existing-list radio shows shopping lists sorted by `updated DESC`; non-shopping lists are excluded.
- [ ] Create-new radio prefills `"Shopping list — <yyyy-MM-dd>"`; editable.
- [ ] Preview shows canonical + unconverted items with `...N more` expander.
- [ ] "Already sent" yellow banner appears when applicable.
- [ ] Send button label shows current item count.

### Server

- [ ] `food.recipes.prepareSendToList` aggregates per the spec: group by `(ingredient_id, variant_id, canonical_unit)`, drop `prep_state` from key, multiply by `scaleFactor`.
- [ ] Unconverted lines are returned in `unconvertedItems` array, one per line, with original qty/unit.
- [ ] `alreadySentToListIds` populated via SQLite default LIKE on `notes` (case-insensitive for ASCII). `%` and `_` in the recipe title are escaped server-side before the query.
- [ ] `food.recipes.sendToList` runs all inserts and updates in one Drizzle transaction.
- [ ] `target.kind='new'` creates the list via `lists.list.create({ name, kind: 'shopping', ownerApp: 'food' })`.
- [ ] Merge logic: match on `(ref_kind, ref_id)`; UPDATE qty + notes + regenerate label.
- [ ] Unconverted items always INSERT (no merge).
- [ ] All error codes from `SendToListError` are returned for their respective conditions.

### Behaviour

- [ ] Scale factor is read from PRD-119's `RecipeScaleProvider` context via the `useRecipeScale()` hook (PRD-119 amendment) and passed to both `prepareSendToList` and `sendToList`.
- [ ] On success, toast shows "Sent N items to <list name>. View list." with a link to `/lists/<id>`.
- [ ] On error, modal stays open with inline error display.
- [ ] Closing the modal mid-flight does NOT cancel the mutation.

### Cross-module

- [ ] `@pops/app-food` does NOT statically import `@pops/app-lists` (verified by inspecting `packages/app-food/package.json`).
- [ ] The picker queries the lists API via `@pops/api-client`.
- [ ] Send button gracefully degrades when `lists` module is uninstalled.

### Tests

- [ ] Vitest + RTL at `packages/app-food/src/pages/__tests__/SendToListModal.test.tsx` covers modal interactions.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/send-to-list.test.ts`:
  - Preview groups correctly: 3 lines with same ingredient → 1 canonical item.
  - prep_state dropped from grouping key; prep slugs collected in notes.
  - Unconverted lines stay separate.
  - Scale factor multiplies canonical qty.
  - Merge into existing list updates qty, appends notes, regenerates label.
  - Notes truncation at 500 chars works.
  - All error codes fire on their respective preconditions.
- [ ] E2E: load a recipe at 2× scale → Send to new list → confirm modal → toast → navigate to `/lists/:id` → items present with doubled quantities and recipe title in notes.

## Out of Scope

- Per-item exclusion in the preview (checkbox per row to skip) — out of scope; user manually removes from the list afterwards.
- Sending multiple recipes at once (multi-select on the recipe list page) — Epic 07 owns plan-derived batch sending.
- Smart unit choices ("show me kg instead of g for >1000g") — display rules; out of scope for the data layer.
- Auto-archive of merged source rows — never; merging is non-destructive metadata.
- Sending recipe-as-component into another recipe's planning surface — Epic 05.
- Pantry-aware "subtract what I already have" — Epic 07.
- Section grouping per store aisle in the resulting list — Epic 07.
- Persisting the user's choice of "last list sent to" as a default — out of scope; v1 always opens the picker.
- Sending to non-shopping lists (e.g. todo) — out of scope; future PRD if a workflow emerges.
- "Undo send" within the picker — closing the modal before clicking Send is the undo path. After Send, items in the list can be deleted manually.
- Per-line scaling overrides — the renderer's scale factor applies to all lines uniformly.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients.name`, `ingredient_variants.name`, `prep_states.slug` for label generation.
- **PRD-107** — `recipe_versions` (title, compile_status), `recipes` (slug).
- **PRD-112** — `list_items.label` / `qty` / `unit` / `ref_kind` / `ref_id` / `notes` / `position`; `idx_list_items_ref` partial index on `(ref_kind, ref_id) WHERE ref_id IS NOT NULL` makes the merge-match query indexable.
- **PRD-116** — `recipe_lines.qty_g` / `qty_ml` / `qty_count` / `canonical_unit` / `optional` (read-only consumption).
- **PRD-119** — Two amendments required (this PRD's only direct surface change on existing PRDs):
  - **(a)** `recipesRouter` is extended with `prepareSendToList` (query) and `sendToList` (mutation). PRD-119's existing list of router procedures (create / saveDraft / promote / archiveVersion / listProposedSlugs / etc.) gains these two.
  - **(b)** `RecipeDetailPage`'s top-right action menu is extended with a "Send to shopping list..." entry between Drafts and Archive. PRD-119's current spec lists only Edit / Drafts / Archive.
  - **(c)** `RecipeDetailPage` introduces a `RecipeScaleProvider` React context wrapping the page + the renderer + the send modal. PRD-119 exports `useRecipeScale()` for consumers.
- **PRD-121** — `RecipeRenderer` continues to accept `scaleFactor` as a prop (no change to PRD-121's API). PRD-119's provider is the source of the value passed to the renderer.
- **PRD-123** — Indirectly: `recipe_lines` canonical qty values are only meaningful after PRD-123's services have run during compile.
- **PRD-139** — module manifest; runtime detection of `lists` installation. The "lists module not installed" UI degradation path is owned by PRD-139's edge-case table.
- **PRD-140** — `lists.list.list` / `lists.list.create` / `lists.items.bulkAdd`; the target-list APIs. Router method names (e.g. `lists.items.bulkAdd`) wrap PRD-112's service methods (e.g. `bulkAdd`) one-to-one — see PRD-140 for the router/service mapping.
