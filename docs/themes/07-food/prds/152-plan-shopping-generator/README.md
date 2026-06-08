# PRD-152: Plan-Derived Shopping List Generator

> Epic: [07 — Pantry-Aware Shopping](../../epics/07-pantry-aware-shopping.md)

## Overview

`/food/shopping/from-plan` — the page that turns "what I've planned this week" into a shopping list. The user picks a date range; the generator walks every plan entry in the range, sums ingredient needs from each recipe's lines (scaled per `plan_entries.planned_servings`), subtracts current non-deleted fridge batches by `(variant_id, canonical_unit)`, surfaces a preview, then on Generate creates a new shopping list via PRD-140's `lists.list.create` + `lists.items.bulkAdd` with items sorted by `store-section:*` tag (PRD-151).

PRD-143's `/food/plan` header gains a "Make shopping list" button that opens this page with the date range pre-filled to the active week.

After this PRD, the meal-prep loop fully closes: plan a week → click Make shopping list → adjust at the supermarket → cook → fridge fills → next week's plan accounts for what's still on the shelf.

## Routes

| Path                                                       | Page           | Purpose                                                             |
| ---------------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| `/food/shopping/from-plan`                                 | `FromPlanPage` | Date-range picker + preview + Generate                              |
| `/food/shopping/from-plan?start=YYYY-MM-DD&end=YYYY-MM-DD` | `FromPlanPage` | Pre-fills the date range from URL params (used by plan-grid button) |

Sub-nav: PRD-118's `app-food` manifest gains a new entry "Shopping" → `/food/shopping/from-plan` under Food (after Solve, before any future shopping surfaces).

The `/food/plan` header (PRD-143) gains a "Make shopping list" button (PRD-143 amendment) that navigates to `/food/shopping/from-plan?start=<week-monday>&end=<week-sunday>`.

## Page layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Make shopping list                                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Date range:  [ 2026-06-08 ] to [ 2026-06-14 ]   [↺ This week]      │
│  4 planned entries in range                                          │
├──────────────────────────────────────────────────────────────────────┤
│  Preview — 18 items to buy across 4 sections                         │
│                                                                       │
│  ▾ Pantry (4)                                                         │
│    flour            500 g   · need 500 g, have 0                    │
│    ...                                                                │
│                                                                       │
│  ▾ Produce (5)                                                        │
│    onion           1.6 kg  · need 2 kg, have 400 g                  │
│    tomato          800 g   · need 800 g, have 0                     │
│    ...                                                                │
│                                                                       │
│  ▾ Other / Uncategorised (3)                                          │
│    saffron          1 g     · need 1 g, have 0                      │
│    ⚠ saffron has no store-section tag — [Tag it]                    │
│                                                                       │
│  ▾ Unconverted (2)                                                    │
│    salt             1 tsp   · canonical qty unknown; sent verbatim │
│                                                                       │
│  ───────────────────────────────────────────────────────────────     │
│  New list name: [ Shopping list — 8-14 Jun ]                         │
│              [Cancel]                      [Generate list]           │
└──────────────────────────────────────────────────────────────────────┘
```

### Header

- **Date range** picker: two date inputs (start, end). Defaults to today + 6 days. "↺ This week" button snaps to the current ISO Mon-Sun.
- **Plan-entry count caption**: live count of `plan_entries` in the range (where `recipe_run_id IS NULL` — already-cooked entries are excluded; their batches are already in the fridge).

### Preview

Collapsible sections grouped by `store-section:*` tag. Each row shows:

- **Ingredient name** + variant (when relevant).
- **Buy qty**: the shortfall to purchase (need − pantry, in the canonical unit).
- **Why**: `need <X>, have <Y>` muted sub-line.
- **Warning chip** for uncategorised ingredients with a "[Tag it]" link → jumps to PRD-122's tag editor with the ingredient pre-focused.

A separate "Unconverted" section catches recipe lines whose canonical qty is null (PRD-116's unresolved-unit case). They're sent verbatim with original qty + unit; no subtraction.

### Generate

- **List name** input: defaults to `"Shopping list — <start-d>-<end-d> <Mon-Mmm>"` (e.g. "Shopping list — 8-14 Jun"). Editable.
- **Cancel**: closes (returns to `/food/plan` if entered via plan-grid button; otherwise stays).
- **Generate list**: calls `food.shopping.generateFromPlan` → creates the shopping list → navigates to `/lists/:id`.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.shopping.previewFromPlan: query({
  input: { startDate: string, endDate: string },   // ISO YYYY-MM-DD; inclusive on both ends
  output: GeneratorPreview,
});

food.shopping.generateFromPlan: mutation({
  input: { startDate: string, endDate: string, listName: string },
  output:
    | { ok: true, listId: number, itemCount: number }
    | { ok: false, reason: GenerateError },
});

export type GeneratorPreview = {
  startDate: string;
  endDate: string;
  planEntryCount: number;
  sections: GeneratorSection[];                    // ordered by store-section ASC; "Other" last; "Unconverted" last-of-all
  uncategorisedIngredientIds: number[];            // for the [Tag it] links
};

export type GeneratorSection = {
  sectionTag: string | null;                       // 'store-section:produce' | null for Other
  sectionLabel: string;                            // 'Produce' | 'Other / Uncategorised' | 'Unconverted'
  items: GeneratorItem[];
};

export type GeneratorItem = {
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  needQty: number;                                 // sum across plan entries, in canonical unit, AT scaled servings
  pantryQty: number;                               // sum of non-deleted, non-empty batches matching (variant_id, unit)
  buyQty: number;                                  // max(needQty - pantryQty, 0)
  canonicalUnit: 'g' | 'ml' | 'count';              // always set per PRD-116's NOT NULL CHECK (defaults to ingredient.default_unit when unit is unconverted)
  isUnconverted: boolean;                          // true when the source recipe_lines row has all three canonical qty fields null — i.e. PRD-116 couldn't compute a canonical qty even though it set canonical_unit to the ingredient's default
  originalQty: number | null;                      // for unconverted: the original qty
  originalUnit: string | null;                     // for unconverted: the original unit
  sourceLineIds: number[];                         // recipe_lines.id contributing to this row
};

export type GenerateError =
  | 'BadDateRange'                                 // end < start, or > 90 days
  | 'NoPlanEntries'                                // range empty
  | 'ListNameEmpty'
  | 'BulkAddFailed';                              // underlying lists.items.bulkAdd raised — full transaction rolled back; no list row left behind
```

### `previewFromPlan` server-side flow

1. Validate dates: end ≥ start; range ≤ 90 days (a sanity cap; not enforced at the DB layer).
2. SELECT `plan_entries` WHERE `date BETWEEN :start AND :end` AND `recipe_run_id IS NULL`. (Already-cooked entries are excluded — their stock is already in the fridge.)
3. For each plan entry: resolve `recipe_version_id = COALESCE(pe.recipe_version_id, recipes.current_version_id)`. Skip entries whose recipe has no current version (uncookable).
4. For each resolved version: SELECT `recipe_lines` WHERE `optional = 0` (optional lines never block / never enter shopping).
5. Compute each line's scaled qty: `line_qty × (planned_servings / recipe_versions.servings)`. If `recipe_versions.servings IS NULL` (or zero), fall back to scale = 1.0. (PRD-152-specific rule; PRD-142's send-action uses a different scale source — the renderer's `scaleFactor` prop, not the plan's `planned_servings` ratio.)
6. Group resulting needs by `(ingredient_id, variant_id, canonical_unit)`, mirroring PRD-142's aggregation key verbatim. `prep_state` is dropped from the grouping key (same as PRD-142). Sum qty per group.
7. Subtract pantry: for each group, SUM `batches.qty_remaining` where `variant_id = :variant_id AND unit = :canonical_unit AND qty_remaining > 0 AND deleted_at IS NULL`. Subtract from need; clamp to 0.
8. Lines with `canonical_unit IS NULL` (PRD-116's unresolved-unit fallback) skip aggregation entirely and become "Unconverted" items, one per line (no merging; matches PRD-142).
9. Resolve each ingredient's `store-section:*` tag via `food.ingredients.tags.list`. If multiple, pick alphabetically first by the full tag string (restricted to tags matching `store-section:*`). If none, group under "Other".
10. Build the `GeneratorSection[]` ordered alphabetically by `sectionLabel` (the human-readable name, e.g. `Bakery` < `Beverages` < `Condiments` < `Dairy` < `Frozen` < `Meat` < `Pantry` < `Produce`); "Other" last among regular sections; "Unconverted" last-of-all.
11. Return the preview.

One round-trip. Recompute on date-range change client-side.

### `generateFromPlan` server-side flow

1. Re-run the preview flow inside a transaction (single source of truth — server doesn't trust client's preview).
2. Validate `listName.trim().length > 0` (else `ListNameEmpty`).
3. `lists.list.create({ name, kind: 'shopping', ownerApp: 'food' })` → new list id.
4. For each `GeneratorItem` with `buyQty > 0` (canonical) or `isUnconverted=true`, build a `ListItemAddInput` (PRD-140's shape):
   - `label`: `<buyQty> <canonical_unit> <ingredient name>[ <variant name>]` for canonical items, or `<originalQty> <originalUnit> <ingredient name>[ <variant name>]` for unconverted.
   - `qty`: `buyQty` (canonical) or `originalQty` (unconverted).
   - `unit`: `canonical_unit` or `originalUnit`.
   - `refKind`: `'variant'` if `variantId IS NOT NULL`, else `'ingredient'`.
   - `refId`: `variantId` or `ingredientId`.
   - `notes`: `"Plan <start>-<end> · <recipe titles joined by ', '>"`. 500-char cap with `…`-front-truncation. (Records provenance back to which recipes generated this row.)
   - `position`: explicit sequence number based on section order + intra-section alphabetic.
5. Call `lists.items.bulkAdd(listId, items)` (PRD-140's existing bulkAdd) in the same transaction.
6. Return `{ ok: true, listId, itemCount }`.

### Sort ordering for the generated list

The generator computes `position` sequentially across the entire item set:

1. Section order: alphabetical by `sectionLabel` (e.g. `Bakery` < `Beverages` < `Condiments` < `Dairy` < `Frozen` < `Meat` < `Pantry` < `Produce`). "Other" (uncategorised) gets `position` after all sections. "Unconverted" items get `position` after Other.
2. Within a section: alphabetical by ingredient name.

The list_items rows are inserted with these explicit `position` values so PRD-140 / PRD-141's flat-list render shows them in section-then-name order without needing schema changes.

`bulkAdd` writes in a single transaction so position uniqueness is implicit (the caller controls them).

## PRD-143 amendment

PRD-143's `/food/plan` header gains a "Make shopping list" button, placed to the right of the Settings (gear) menu. Click navigates to `/food/shopping/from-plan?start=<weekMonday>&end=<weekSunday>` for the currently-viewed week. This is a formal PRD-143 amendment driven by this PRD; the AC sits in this PRD's "PRD-143 amendment" sub-section (below) so the implementer reads it in one place.

## PRD-140 amendment

PRD-140's `lists.items.bulkAdd` mutation takes `ItemAddInput[]` per its existing spec. PRD-152 requires that shape to accept an explicit `position` value so the generator can write items in section-then-name order without a follow-up `lists.items.reorder` call. The amendment adds an optional field:

```ts
export type ItemAddInput = {
  label: string;
  qty?: number;
  unit?: string;
  refKind?: 'free' | 'ingredient' | 'variant' | 'recipe' | 'custom';
  refId?: number;
  notes?: string;
  position?: number; // NEW — when provided, sets list_items.position directly. When omitted, PRD-140's default (MAX(position)+1) applies.
};
```

Backwards-compatible: existing callers that omit `position` keep their current behaviour. PRD-152 supplies sequential `position` values for the entire item set in one transactional bulkAdd call.

## Business Rules

- The generator considers only `plan_entries` where `recipe_run_id IS NULL` (still-planned entries). Already-cooked entries don't contribute — their inputs were already consumed from batches.
- Optional ingredient lines (`recipe_lines.optional = 1`) NEVER produce shopping items.
- Lines with null canonical qty (PRD-116's unresolved-unit) become standalone "Unconverted" items, never aggregated.
- Pantry subtraction is strict by `(variant_id, canonical_unit)`. A batch in count unit doesn't subtract a need in grams (no PRD-123 conversion at this layer; matches PRD-142).
- An ingredient with multiple `store-section:*` tags groups under the alphabetically-first one. Documented in the preview so users know.
- An ingredient with no `store-section:*` tag groups under "Other / Uncategorised". UI surfaces a [Tag it] link.
- `recipe_versions.servings` null → scale = 1.0 (per PRD-142).
- Generator output is always a NEW list. It does not append to existing lists. Users wanting to combine multiple plan windows generate then merge manually.
- Generated list's `notes` records provenance (`Plan <start>-<end> · <recipes>`).
- The user must confirm Generate; the preview is informational and doesn't pre-commit anything.
- Polling: `previewFromPlan` does NOT poll — the preview is a snapshot at the moment of date-range change. User clicks Generate explicitly.
- 90-day date range cap as a sanity limit. Users with longer planning horizons split into multiple lists.

## Edge Cases

| Case                                                                                      | Behaviour                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User picks `end < start`                                                                  | Server returns `BadDateRange`. UI also validates client-side.                                                                                                                                 |
| Date range > 90 days                                                                      | `BadDateRange`. UI shows: "Range is too long — split into shorter windows."                                                                                                                   |
| Range with 0 plan entries                                                                 | Preview shows "0 planned entries in range. Nothing to shop for." Generate button disabled.                                                                                                    |
| Plan entry pinned to an archived recipe version                                           | Resolves via `COALESCE(pe.recipe_version_id, recipes.current_version_id)`; uses the pinned version even if archived. Matches PRD-111.                                                         |
| Plan entry for a recipe with no current version AND no pin                                | Skipped — uncookable. Preview surfaces a small caption "<N entries skipped — recipe has no current version>".                                                                                 |
| Recipe with `compile_status='failed'`                                                     | PRD-116 DELETEs `recipe_lines` on any compile failure (parse / resolve / cycle / materialise). So failed-compile recipes contribute zero lines and produce no shopping items.                 |
| Multiple plan entries for the same recipe in the range                                    | All contribute. Needs sum normally.                                                                                                                                                           |
| Ingredient with multiple `store-section:*` tags                                           | Alphabetically first wins. UI surfaces in row sub-line: "Tagged in: produce, condiments — using produce".                                                                                     |
| Ingredient with one `store-section:produce` and one `diet:vegan` tag                      | Only `store-section:*` matters here. `diet:*` is informational.                                                                                                                               |
| Pantry has a batch in `count` unit and recipe needs in `g`                                | Strict subtraction: doesn't reduce. Item appears with full `buyQty`.                                                                                                                          |
| Pantry has 500g batch and recipe needs 200g                                               | Need=200g, have=500g, buyQty=0. Item NOT added to the generated list (PRD-141 only shows non-empty needs).                                                                                    |
| Two recipes need 200g flour each → sum 400g                                               | Aggregated correctly into one preview row.                                                                                                                                                    |
| Recipe with 0 ingredient lines                                                            | Contributes nothing. Plan entry doesn't error.                                                                                                                                                |
| List name conflicts with an existing list                                                 | Allowed — lists names aren't unique. New list created with the same name.                                                                                                                     |
| `recipe_versions.servings IS NULL`                                                        | Scale = 1.0. Documented.                                                                                                                                                                      |
| User cancels the modal after `previewFromPlan` ran                                        | No mutation fired. No state to clean up.                                                                                                                                                      |
| `generateFromPlan` partially succeeds (list created, bulkAdd fails)                       | Server transaction rolls back BOTH operations. Returns `PartialFailure` with the underlying reason. UI suggests retry.                                                                        |
| Concurrent users (single-user POPS edge)                                                  | Two browsers generating same range = two new lists. Lists are cheap; no dedup.                                                                                                                |
| Recipe with a yield (component recipe) whose lines reference batches still being produced | Generator doesn't know about Sunday's prep producing patties for Tuesday. Strict subtraction sees only currently-existing batches. Acceptable in v1; future PRD could project planned yields. |

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [ ] `/food/shopping/from-plan` route registered in PRD-118's `app-food` manifest with sidebar entry "Shopping".
- [ ] Sidebar order places Shopping after Solve.
- [ ] PRD-143's `/food/plan` header gains a "Make shopping list" button linking to `/food/shopping/from-plan?start=<week-monday>&end=<week-sunday>` for the active week.

### Page

- [ ] Date-range picker with start + end inputs; defaults to today + 6 days; "↺ This week" button snaps to ISO Mon-Sun.
- [ ] Plan-entry count caption updates as range changes.
- [ ] Preview groups items by section (alphabetical sectionTag); "Other" last; "Unconverted" last-of-all.
- [ ] Each preview row shows ingredient + variant + need / have / buy + canonical unit.
- [ ] Uncategorised section shows a [Tag it] link to PRD-122 with the ingredient focused.
- [ ] Unconverted section is visually distinct.
- [ ] List name input pre-fills with the canonical default; editable.
- [ ] Generate button calls `food.shopping.generateFromPlan` and navigates to `/lists/:id` on success.

### Generator

- [ ] `food.shopping.previewFromPlan` returns `GeneratorPreview` matching the schema; one round-trip.
- [ ] `food.shopping.generateFromPlan` runs as one Drizzle transaction wrapping `lists.list.create` + `lists.items.bulkAdd`.
- [ ] Date validation: end < start → `BadDateRange`; range > 90 days → `BadDateRange`; empty list name → `ListNameEmpty`.
- [ ] Already-cooked plan entries (`recipe_run_id IS NOT NULL`) excluded.
- [ ] Optional lines (`recipe_lines.optional = 1`) excluded.
- [ ] Canonical-null lines surface in the Unconverted section, one per line.
- [ ] Pantry subtraction strict by `(variant_id, canonical_unit)`; mismatched units don't subtract.
- [ ] Scaled by `planned_servings / recipe_versions.servings` (1.0 fallback when servings null).
- [ ] Items inserted with explicit `position` matching the preview's section-then-name order.

### Tests

- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/shopping-generator.test.ts`:
  - 2 recipes × 3 ingredients each → aggregates correctly into 6 rows or fewer with merging.
  - Pantry batch fully covers an ingredient → buyQty=0 → item NOT in generated list.
  - Pantry batch partially covers → correct buyQty.
  - Optional line excluded.
  - Already-cooked plan entry excluded.
  - Unconverted line surfaces in its own section.
  - Multi-section-tag ingredient picks alphabetically first.
  - Bad date range / empty list name fire correct errors.
  - Transactional rollback on bulkAdd failure.
- [ ] Vitest + RTL at `packages/app-food/src/pages/shopping/__tests__/FromPlanPage.test.tsx` covers date picker + preview render + Generate flow.

### Mobile

- [ ] Page readable at 375px.
- [ ] Date inputs use native pickers on mobile.
- [ ] Section expanders tappable.

## Out of Scope

- Substitution-aware pantry subtraction — explicit Epic 07 Key Decision; PRD-150's solver remains the substitution surface.
- Projected pantry state (accounting for upcoming planned cooks producing components) — out of scope; v1 sees only current batches.
- Appending to an existing shopping list — always creates new in v1.
- Multi-store generation (different sections per store) — out of scope.
- Quantity rounding to "buy at supermarket sizes" (round up 250g to 500g pack) — out of scope; UI shows the exact computed need.
- Cost estimation per item — out of scope (cross-domain with finance).
- LLM-assisted "you forgot to add X to your plan" suggestions — out of scope.
- Recurring shopping list templates — out of scope.
- "Use up expiring" tab on the generator (matches PRD-150's hint at a future expiry-aware solver tab) — deferred to a future PRD; v1 generator does strict pantry subtraction with no expiry boost on either generator or solver surfaces.
- Explicit section header dividers in the generated list — deferred (would require `list_items.section_label` schema). Section-sorted ordering does the job in v1.
- Receipt scanning post-shopping to mark items checked — out of scope.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients` schema (names, slugs, default_unit).
- **PRD-108** — `batches` schema (`qty_remaining`, `variant_id`, `unit`, `deleted_at` from PRD-145).
- **PRD-111** — `plan_entries` schema (`date`, `recipe_id`, `recipe_version_id`, `planned_servings`, `recipe_run_id`).
- **PRD-116** — `recipe_lines` with canonical qty + `variant_id` + `optional` + `position`.
- **PRD-118** — `app-food` shell; new sub-nav entry.
- **PRD-140** — `lists.list.create` + `lists.items.bulkAdd` (called transactionally).
- **PRD-142** — Strict-by-`(ingredient_id, variant_id, canonical_unit)` aggregation rule (precedent; this PRD mirrors).
- **PRD-143** — Amendment: `/food/plan` header gains a "Make shopping list" button.
- **PRD-145** — `batches.deleted_at` (filter from pantry sum).
- **PRD-151** — `ingredient_tags` table + `food.ingredients.tags.*` services; `store-section:*` namespace convention.
