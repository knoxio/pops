# PRD-147: Fridge Inventory View

> Epic: [05 — Meal Planning & Batches](../../epics/05-meal-planning.md)

## Overview

`/food/fridge` — the browse-all-batches page. Lists every batch with `qty_remaining > 0` AND `deleted_at IS NULL`, grouped by location (collapsible sections), sorted by expiry ascending. Filter by location, ingredient search, prep-state. Per-row actions: Edit, Relocate, Adjust qty, Cook now, Delete. A "+ Add batch" floating button opens PRD-145's `createBatchManual` form. A "Show empties / deleted" toggle reveals hidden rows.

After this PRD, the user can stand in front of their fridge with the phone and see exactly what's there, what's expiring tomorrow, and what they can cook with it. Per-row Cook now jumps to a filtered recipe picker — useful for "I have this leftover chicken; what can I make?"

This is the inventory-side surface that closes Epic 05's meal-prep loop. Consumes PRD-145's services exclusively; introduces no schema changes.

## Routes

| Path                      | Page         | Purpose                                                      |
| ------------------------- | ------------ | ------------------------------------------------------------ |
| `/food/fridge`            | `FridgePage` | All non-deleted, non-empty batches grouped by location       |
| `/food/fridge?batch=<id>` | `FridgePage` | Same page; scrolls to + highlights the given batch           |
| `/food/fridge?showAll=1`  | `FridgePage` | Includes `qty_remaining=0` and `deleted_at IS NOT NULL` rows |
| `/food/fridge?add=1`      | `FridgePage` | Renders the "+ Add batch" modal overlaid                     |
| `/food/fridge?edit=<id>`  | `FridgePage` | Renders the "Edit batch" modal overlaid                      |

`?batch=<id>` is the deep-link from PRD-144's success toast ("View batch"). Page renders the same content with a small auto-scroll + 2-second highlight pulse on the row.

## Page Specifications

### Header

- **Title**: "Fridge".
- **Search bar**: text input; filters by ingredient name + variant name (case-insensitive substring). Debounced 200ms.
- **Filter chips**:
  - **Location** (multi-select; default: all). Chips: Pantry / Fridge / Freezer / Other.
  - **Expiring soon** (toggle). On: filters to batches with `expires_at <= today + 7 days`.
  - **Recipe-yielded** (toggle). On: filters to batches with `source_type = 'recipe_run'`. Off (default): all sources.
- **Show all toggle**: a small text-link, "Show N empty + M deleted". Click to set `?showAll=1`. Hidden when both counts are zero.
- **"+ Add batch" button**: top-right; opens the add modal.

### Layout

Two layout modes, both grouped by location:

#### Sectioned list (desktop ≥768px, mobile portrait)

```
┌────────────────────────────────────────────────────────────────────┐
│ Fridge                                       [+ Add batch]          │
├────────────────────────────────────────────────────────────────────┤
│ [search...]   Location: All    Expiring: Off    Yielded: Off       │
│ Show 3 empty + 1 deleted                                            │
├────────────────────────────────────────────────────────────────────┤
│ ▾ Fridge (8 batches)                                               │
│ ────────────────────────────────────────────────────────────────── │
│ ⚠ Onion / yellow / diced          200 g    Exp Jun 10 (in 2d) [⋮]  │
│ ⚠ Cream / double                  300 ml   Exp Jun 11 (in 3d) [⋮]  │
│   Chicken / breast / shredded     1.2 kg  Exp Jun 12 (in 4d) [⋮]  │
│   Tikka masala / red                3 ct    Exp Jun 15 (in 7d) [⋮]  │
│   ...                                                               │
│                                                                     │
│ ▸ Pantry (12 batches)                                              │
│ ▸ Freezer (4 batches)                                              │
│ ▸ Other (0 batches)                                                │
└────────────────────────────────────────────────────────────────────┘
```

- Section header: `▾ <Location> (<count> batches)`. Click toggles collapse. Collapsed state persists in `localStorage` per location.
- Sub-grouping within a section: by ingredient (collapsible). Default expanded; collapse only when >3 variants of the same ingredient. E.g. "Chicken" section in fridge contains "Chicken / breast / shredded", "Chicken / breast / diced", "Chicken / thigh / whole" — collapses to "Chicken (3 batches)" with expand caret.
- Expiry icons: ⚠ for batches expiring within 3 days; 🔴 for already-expired. Sort within a sub-group: `expires_at ASC NULLS LAST, produced_at ASC`.

#### Row content

- **Ingredient / variant / prep-state**: `<Ingredient> / <Variant> / <prep>` (variant omitted if NULL; prep omitted if NULL).
- **Qty**: human-readable (`1.2 kg` for >=1000g, `200 g` for <1000g; same for ml; `3 ct` for count).
- **Expiry**: "Exp Jun 10 (in 2d)" / "Exp Jun 5 (expired 3d ago)". Null expiry shows as `—` with tooltip "Shelf-stable / unknown".
- **Three-dot menu** [⋮]: Edit, Relocate, Adjust qty, Cook now, Delete.

### Add batch modal

Pre-filled with sensible defaults; user fills in:

- **Ingredient picker** (typeahead, required): searches `ingredients` by name + slug. Selecting an ingredient populates variant picker.
- **Variant picker** (typeahead, required): filtered to the selected ingredient's variants. Shows variant name + slug; default unit shown alongside.
- **Prep state picker** (typeahead, optional): from `prep_states`. Null OK.
- **Quantity + unit**: number + dropdown. Unit defaults to variant's `default_unit`. Allows override (e.g. record bananas as count even though default is `g`).
- **Source type radio**: Purchase / Gift / Other. (No `recipe_run` — that's only via cook flow.)
- **Location radio**: Pantry / Fridge / Freezer / Other. Default = Fridge.
- **Produced at**: date input; default = today.
- **Expires at**: date input; auto-fills from `produced_at + default_shelf_life_days_<location>` when ingredient + variant + location are chosen. Override allowed; null OK.
- **Notes**: optional textarea, 500-char cap.
- **Buttons**: Cancel / Add batch.

On Add: calls `food.batches.create` (PRD-145's `createBatchManual`).

### Edit modal

Opens via row menu Edit or `?edit=<id>` URL. Renders the same form as Add but pre-filled and with some fields disabled:

- **Ingredient / variant** disabled (can't change — create a new batch instead).
- **Prep state** editable iff `source_type != 'recipe_run'` (per PRD-145's `CannotEditFromRun` rule).
- **Qty** editable via a separate "Adjust qty" modal — not editable inline (the Edit modal hides the qty field). Reason: qty adjustments are audit-trail-worthy and need a reason picker.
- **Source type / produced at** disabled.
- **Location** editable — but via the Relocate action (separate modal). The Edit modal hides location too.
- **Expires at, notes** editable.

This split mirrors PRD-145's service granularity: `editBatch` for expiry + notes + prepState; `relocateBatch` for location; `adjustBatchQty` for qty.

### Relocate modal

Tiny modal: Location radio (current location pre-selected) + Save. Calls `food.batches.relocate`. Auto-reapplies expiry default per PRD-145's relocation logic.

### Adjust qty modal

- **Current qty**: displayed (read-only).
- **Adjustment**: number input. Positive or negative.
- **Reason radio**: Spoiled / Wasted / Correction. Spoiled and Wasted require `delta < 0` (UI enforces); Correction allows any sign.
- **Save**: calls `food.batches.adjustQty`. On `NegativeQty` error, inline message + retry.

### Delete confirm

- "Delete this batch?" with the qty + variant displayed.
- For non-empty batches: explicit warning "This batch still has 200 g remaining. Deleting will mark it as removed from inventory."
- For empty batches: simpler "This batch is empty. Mark as deleted to hide from the default view."
- Calls `food.batches.delete` (soft-delete via PRD-145).

### Cook now (from a batch)

The row menu's "Cook now" entry opens a small picker:

- "What can you cook with this batch?"
- Lists recipes whose `recipe_lines` reference this batch's `variant_id` (any prep state). Sorted by cook history desc (recently cooked first), tied by title.
- Each row: recipe title + a one-line preview of how this batch fits ("Needs ~250g; you have 1200g") — `~` prefix is intentional because the match is variant-only, not prep-aware. The picker may surface a recipe needing diced onion when the batch is sliced; PRD-108's strict-FIFO would shortfall on prep mismatch and the user resolves via PRD-146's batch-override at cook time.
- Click a recipe → navigates to `/food/recipes/:slug` (the cook flow takes over there).

This is a light-touch affordance — Epic 06 will add a real "what can I cook" solver that's prep-state aware. v1 filters recipes by `variant_id` only; the variant-only join is documented as imprecise.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.fridge.view: query({
  input: {
    search?: string,
    locations?: Array<'pantry' | 'fridge' | 'freezer' | 'other'>,
    expiringSoon?: boolean,
    recipeYieldedOnly?: boolean,
    includeEmpty?: boolean,                       // qty_remaining = 0
    includeDeleted?: boolean,                     // deleted_at IS NOT NULL
  },
  output: FridgeView,
});

food.fridge.recipesUsingBatch: query({
  input: { batchId: number, limit?: number },
  output: { items: RecipeForCookRow[] },
});

export type FridgeView = {
  sections: FridgeLocationSection[];
  counts: {
    visible: number;
    empty: number;
    deleted: number;
  };
};

export type FridgeLocationSection = {
  location: 'pantry' | 'fridge' | 'freezer' | 'other';
  count: number;
  ingredients: FridgeIngredientGroup[];
};

export type FridgeIngredientGroup = {
  ingredientId: number;
  ingredientName: string;
  ingredientSlug: string;
  batches: FridgeBatchRow[];
};

export type FridgeBatchRow = {
  id: number;
  variantName: string | null;
  variantSlug: string | null;
  prepStateLabel: string | null;
  qtyRemaining: number;
  unit: 'g' | 'ml' | 'count';
  expiresAt: string | null;
  daysToExpiry: number | null;                    // negative = expired N days ago
  producedAt: string;
  sourceType: 'purchase' | 'recipe_run' | 'gift' | 'other';
  sourceRecipeSlug: string | null;                // when sourceType='recipe_run'
  notes: string | null;
  deletedAt: string | null;
};

export type RecipeForCookRow = {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: string | null;
  lineCount: number;                              // # of recipe_lines that match this batch's variant
  recipeNeedsQty: number | null;                  // sum across matching lines whose canonical_unit matches batch's unit; null when no matching-unit line exists
  lastCookedAt: string | null;
};
```

### `view` server-side flow

1. SELECT `batches` JOIN `ingredient_variants` JOIN `ingredients` JOIN `prep_states` (LEFT) WHERE:
   - `qty_remaining > 0` unless `includeEmpty=true`.
   - `deleted_at IS NULL` unless `includeDeleted=true`.
   - `location IN locations` if provided.
   - `expires_at <= today + 7 days` if `expiringSoon=true`.
   - `source_type = 'recipe_run'` if `recipeYieldedOnly=true`.
   - Ingredient.name OR variant.name LIKE `%search%` if `search` provided (case-insensitive).
2. ORDER BY `location, ingredients.name ASC, expires_at ASC NULLS LAST, produced_at ASC`.
3. Group server-side into `FridgeLocationSection` / `FridgeIngredientGroup` / `FridgeBatchRow`. Compute `daysToExpiry` as `expires_at - today` in days (using `date-fns` for tz-safe math).
4. Also SELECT total counts (visible / empty / deleted) for the header chip.

One round-trip per page load + 60s polling refresh.

### `recipesUsingBatch` server-side flow

1. SELECT `recipes` JOIN `recipe_versions` (current_version_id) JOIN `recipe_lines` WHERE `recipe_lines.variant_id = batch.variant_id`.
2. LEFT JOIN `recipe_runs` for `lastCookedAt` (MAX of completed_at).
3. ORDER BY `last_cooked_at DESC NULLS LAST, recipes.slug ASC`.
4. LIMIT 20 by default.
5. Compute `recipeNeedsQty` as `SUM(recipe_lines.qty_g | qty_ml | qty_count)` over lines whose `canonical_unit` matches the batch's `unit`. Lines with null canonical qty (PRD-116 didn't normalise — see PRD-123) are silently excluded from the sum. If no matching-unit lines exist, `recipeNeedsQty IS NULL`; the UI then renders "Needs ~?" instead of "Needs ~Xg".

## Sidebar integration

PRD-118's `app-food` manifest gains a new sub-nav entry under Food: "Fridge" → `/food/fridge`. Badge shows the count of batches expiring within 3 days (small red dot if any expired).

## Business Rules

- Default view: `qty_remaining > 0 AND deleted_at IS NULL`, all locations, no search, no filters.
- Expiry-soon threshold: 7 days (filter chip) and 3 days (badge / warning icon). Constants in code, not user-configurable in v1.
- Empty batches are hidden by default but reachable via Show-all toggle. They still appear in cook-history JOINs.
- Deleted batches are hidden by default but reachable via Show-all toggle. They never appear in PRD-108's FIFO consume.
- Location grouping: sections are collapsible; collapsed state persists per-location in `localStorage`. The four hardcoded locations always appear, even if empty (the section just shows `(0 batches)` and is collapsed).
- Ingredient sub-grouping kicks in only when an ingredient has >3 variants in the same location. Otherwise variants list flat under the ingredient name.
- Edit / Relocate / Adjust qty / Delete are PRD-145 service calls via the existing tRPC procedures (`food.batches.edit` / `relocate` / `adjustQty` / `delete`).
- Optimistic UI on Edit / Relocate / Adjust / Delete. Rollback + toast on error.
- 60s polling refresh while page is visible.
- Empty state (no batches at all): "Nothing in the fridge yet. Click '+ Add batch' or cook a recipe to fill it."
- `?batch=<id>` deep-link scrolls to the row + applies a 2-second pulse highlight; if the batch is filtered out by current filters, expand showAll automatically + reset location filter.

## Edge Cases

| Case                                                                                  | Behaviour                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 300 batches in fridge                                                                 | No pagination in v1. Rendered as a single long scroll. Section collapse keeps it manageable.                                               |
| User adds a batch with `unit` mismatching the variant's `default_unit`                | Allowed; row displays in the user's chosen unit. PRD-108's FIFO matches on unit, so this batch only FIFO-consumes against same-unit needs. |
| Variant has no expiry defaults set (both shelf-life columns NULL)                     | Auto-fill leaves expires_at blank; row shows `—` with tooltip "Shelf-stable / unknown".                                                    |
| User filters by "Expiring soon" with 0 results                                        | Empty state for the filtered view: "Nothing expiring in the next 7 days."                                                                  |
| Cook now picker on a batch whose variant is used in 0 recipes                         | Picker shows: "No recipes use this batch's ingredient yet. Try creating one!" with a link to `/food/recipes/new`.                          |
| User edits expiry to a date earlier than `produced_at`                                | PRD-145's `editBatch` rejects (`BadExpiry`). UI shows inline error.                                                                        |
| User opens `?batch=<id>` for a deleted batch                                          | Auto-toggles `showAll=1`; scrolls to the row in the "deleted" subsection. Toast: "This batch was deleted on <date>."                       |
| Two tabs both delete the same batch                                                   | First succeeds; second sees `deleted_at IS NOT NULL` and is a no-op (idempotent).                                                          |
| Search query matches 100 batches across all locations                                 | All matched rows render; sections collapse if their match count is 0.                                                                      |
| User adjusts qty by +500 (correction)                                                 | Allowed via `reason='correction'`. PRD-145's service updates qty + appends notes.                                                          |
| Adjust qty by -200 with reason='wasted'                                               | Allowed. Notes append: "Wasted 200g on <date>".                                                                                            |
| Relocate from fridge to freezer for a batch with non-default expiry (user-overridden) | Expiry preserved per PRD-145's logic.                                                                                                      |
| Network drops mid-Edit                                                                | Optimistic UI rolls back; toast: "Couldn't save — try again."                                                                              |
| `daysToExpiry` calculation lands on a daylight-saving boundary                        | Calculated via `date-fns`'s `differenceInDays` against the user's local timezone. Test case pins this.                                     |
| 60s poll fires during a user's open modal                                             | Modal data isn't refetched (modal owns its own copy from the row data at open time). Closing the modal triggers a fresh fetch.             |

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [ ] `/food/fridge` registered in PRD-118's `app-food` manifest with sidebar entry.
- [ ] Sidebar badge shows count of batches with `expires_at` within 3 days; red dot for expired.
- [ ] `?batch=<id>` deep-link works; auto-expands filters as needed.

### Page

- [ ] Header search + filter chips + show-all toggle all functional.
- [ ] Sections grouped by location, collapsible, persisted in localStorage.
- [ ] Within a section, ingredient sub-grouping when >3 variants of the same ingredient.
- [ ] Rows display ingredient/variant/prep, qty, expiry with warning icons, three-dot menu.
- [ ] Empty state copy matches spec.
- [ ] 60s polling refresh while visible.

### Modals

- [ ] Add batch modal validates required fields; expires auto-fills; calls `food.batches.create`.
- [ ] Edit modal pre-fills; respects `CannotEditFromRun` for `prep_state_id`.
- [ ] Relocate modal calls `food.batches.relocate`.
- [ ] Adjust qty modal enforces reason/sign rules; calls `food.batches.adjustQty`.
- [ ] Delete confirm distinguishes non-empty vs empty wording.
- [ ] Cook now picker renders `recipesUsingBatch` results sorted by recent cook.

### tRPC

- [ ] `food.fridge.view` returns `FridgeView` with sections / ingredients / batches per the schema.
- [ ] `food.fridge.recipesUsingBatch` returns `RecipeForCookRow[]` sorted by last cooked.
- [ ] `daysToExpiry` computed using `date-fns` for timezone safety.
- [ ] All filter combinations produce a single SQL query (no N+1).

### Mobile

- [ ] Page readable at 375px; all controls reachable with thumb.
- [ ] Sections collapsible via tap.
- [ ] Modals render as bottom-sheets on mobile.

### Tests

- [ ] Vitest + RTL at `packages/app-food/src/pages/fridge/__tests__/FridgePage.test.tsx` covers render + filter + modal flows.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/fridge-router.test.ts`:
  - View returns sections with correct grouping and sort.
  - Filter combinations narrow results correctly.
  - `recipesUsingBatch` returns recipes filtered by variant + sorted by lastCookedAt.
  - `daysToExpiry` boundary case (today / yesterday / tomorrow / DST switch).
- [ ] E2E: add a batch → edit expiry → relocate → adjust waste → delete → verify each transition reflects in the page.

## Out of Scope

- Pantry-aware shopping list — Epic 07.
- Plan-derived "what do I still need?" — Epic 07.
- Substitution-aware "Cook now" picker (e.g. "you have whole onion, here are recipes that need diced") — Epic 06.
- Real "what should I cook tonight?" solver — Epic 06.
- Receipt scanning to auto-create batches — out of scope (cross-domain with finance).
- Photo / barcode scan to add a batch — out of scope.
- Per-batch images — out of scope.
- Bulk operations (multi-select delete, multi-relocate) — out of scope; per-row.
- A list-view density toggle — out of scope.
- A separate "expiring today" notification surface — out of scope (badge + warning icon is enough).
- A graph view of historical inventory — out of scope.
- Inventory export to CSV — out of scope.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients` / `ingredient_variants` / `prep_states` schema.
- **PRD-108** — `batches` schema (extended by PRD-145's `deleted_at` column).
- **PRD-118** — `app-food` shell; new sidebar entry.
- **PRD-119** — `recipes` / `recipe_versions` join targets for the "Cook now" picker.
- **PRD-145** — `food.batches.*` services (consumed for Edit / Relocate / Adjust / Delete / Add).
- **PRD-146** — adjacent; the "Cook now" picker on a batch does NOT invoke PRD-146's overrides directly. Clicking a recipe navigates to `/food/recipes/:slug` where the standard cook flow takes over.
