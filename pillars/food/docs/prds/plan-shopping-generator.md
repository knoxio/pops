# Plan-Derived Shopping List Generator

Status: Partial — preview + generate + page shipped. Generate writes to the lists pillar with one `addItem` call per row (insertion order = display order); it is NOT transactional and a mid-write failure leaves a partial list, there is no explicit-`position` bulk write, and multi-tag rows don't surface a provenance sub-line. Those gaps live in `../../ideas/shopping-generator-transactional-write.md`.

Turns "what I planned this week" into a shopping list. The user picks a date range; the generator walks every still-planned entry in range, sums each recipe's ingredient needs (scaled per `plan_entries.planned_servings`), subtracts current fridge batches by `(variant_id, canonical_unit)`, shows a sectioned preview, then on Generate creates a new shopping list in the lists pillar with items ordered by `store-section:*` tag. The plan page gets a "Make shopping list" button that opens the page pre-filled to the active week, closing the meal-prep loop: plan → make list → shop → cook → fridge fills → next week's plan accounts for what's left.

## Routes & shell

- Page `FromPlanPage` at `/food/shopping/from-plan`. `?start=YYYY-MM-DD&end=YYYY-MM-DD` pre-fills the range.
- Food manifest exposes a "Shopping" sidebar entry → `/shopping/from-plan`, placed after "Solve".
- The plan page header has a "Make shopping list" button (`data-testid="make-shopping-list-btn"`) that navigates to `/food/shopping/from-plan?start=<week-monday>&end=<week-sunday>` for the viewed week.

## REST API surface

The food pillar serves a `shopping.*` ts-rest sub-router (both POST-with-body, date-range compute):

- `POST /shopping/preview` — body `{ startDate, endDate }` (ISO `YYYY-MM-DD`, both ends inclusive) → `200 GeneratorPreview`, or `400 { message, code }` for a bad range.
- `POST /shopping/generate` — body `{ startDate, endDate, listName }` → `200 GenerateResult`.

```ts
type GeneratorPreview = {
  startDate: string;
  endDate: string;
  planEntryCount: number; // entries that contributed
  skippedPlanEntryCount: number; // in-range entries with no resolvable version
  sections: GeneratorSection[]; // store-sections alpha by label; "Other" last; "Unconverted" last-of-all
  uncategorisedIngredientIds: number[]; // for [Tag it] links
  recipeTitles: string[]; // provenance, plan-date order
};
type GeneratorSection = { sectionTag: string | null; sectionLabel: string; items: GeneratorItem[] };
type GeneratorItem = {
  ingredientId: number;
  ingredientName: string;
  variantId: number | null;
  variantName: string | null;
  needQty: number; // summed across entries, canonical unit, at scaled servings
  pantryQty: number; // matching non-deleted, non-empty batches
  buyQty: number; // max(needQty - pantryQty, 0)
  canonicalUnit: 'g' | 'ml' | 'count';
  isUnconverted: boolean; // source line had all canonical qty fields null
  originalQty: number | null;
  originalUnit: string | null; // for unconverted
  sourceLineIds: number[];
};
type GenerateResult =
  | { ok: true; listId: number; itemCount: number }
  | { ok: false; reason: 'BadDateRange' | 'NoPlanEntries' | 'ListNameEmpty' | 'BulkAddFailed' };
```

Cross-pillar writes go through a `ListsClient` (HTTP, base URL resolved from the registry): `POST /lists` to create a `kind: 'shopping', ownerApp: 'food'` list, then `POST /lists/:id/items` per row. No DB reach-in.

## Preview computation (one round-trip)

1. Validate dates: both ends inclusive, `end ≥ start`, range ≤ 90 days, both well-formed ISO — else `BadDateRange`.
2. Load `plan_entries` where `date BETWEEN start AND end` AND `recipe_run_id IS NULL` (already-cooked entries are excluded — their stock is in the fridge). Resolve effective version via `COALESCE(pe.recipe_version_id, recipes.current_version_id)`; entries with no resolvable version are skipped and counted in `skippedPlanEntryCount`.
3. Load each version's `recipe_lines` where `optional = 0`. Scale each line by `planned_servings / recipe_versions.servings`, falling back to `1.0` when `servings` is null or ≤ 0.
4. Group by `(ingredient_id, variant_id, canonical_unit)`; sum scaled qty. Lines whose canonical qty is null become standalone "Unconverted" items, one per line (no merging).
5. Subtract pantry: SUM `batches.qty_remaining` per `(variant_id, unit)` over non-deleted (`deleted_at IS NULL`), non-empty (`qty_remaining > 0`) batches; `buyQty = max(need − have, 0)`. Needs with no variant get pantry 0 (batches are variant-scoped).
6. Resolve each ingredient's `store-section:*` tag (alphabetically-first when several); untagged → "Other / Uncategorised". Section label is the title-cased slug (`store-section:bakery` → `Bakery`).
7. Order sections alphabetically by label; "Other" last among tagged sections; "Unconverted" last-of-all. Within a section, sort by ingredient name then variant name.

## Generate

1. Trim `listName`; empty → `ListNameEmpty`.
2. Re-run the preview server-side (single source of truth — the client preview is never trusted). A bad range propagates as `BadDateRange`.
3. Collect writable rows: `isUnconverted || buyQty > 0`. None → `NoPlanEntries`.
4. Create the shopping list, then add each row in section-then-name order. Each item carries: `label` = `<qty> <unit> <ingredient>[ <variant>]`, `qty`/`unit` (`buyQty`+canonicalUnit, or original qty/unit for unconverted), `refKind` = `'variant'` when a variant is set else `'ingredient'`, `refId`, and `notes` = `"Plan <start>-<end> · <recipe titles>"` front-truncated to 500 chars with a leading `…` so the `Plan <start>-<end> ·` provenance prefix always survives.
5. On success return `{ ok: true, listId, itemCount }`. Any write failure returns `{ ok: false, reason: 'BulkAddFailed' }` (rows already written are NOT rolled back — see idea).

Default list name (en-AU short months, editable): `Shopping list — <d Mmm>` for a single day, `Shopping list — <d>-<d> Mmm` within one month, `Shopping list — <d Mmm>-<d Mmm>` across months.

## Page

- Date-range picker: start + end inputs, defaulting to today + 6 days, with a "This week" snap to ISO Mon-Sun. Native pickers on mobile.
- Caption shows the contributing plan-entry count, updating as the range changes; 0 entries disables Generate.
- Collapsible sections in preview order; each row shows ingredient (+ variant), a `need <X>, have <Y>` muted sub-line, and the buy qty. Unconverted rows show an "unconverted" hint instead of need/have.
- Uncategorised rows show a "[Tag it]" link (`data-testid="tag-it-link"`) to the ingredient tag editor (`/food/data/ingredients?focus=<id>`).
- Editable list-name input pre-filled with the default; Generate calls `POST /shopping/generate` and navigates to the created list on success.

## Business rules

- Only `recipe_run_id IS NULL` entries contribute. Optional lines (`recipe_lines.optional = 1`) never produce items. Null-canonical lines become standalone Unconverted items, never aggregated.
- Pantry subtraction is strict by `(variant_id, canonical_unit)` — a `count` batch never offsets a `g` need (no unit conversion at this layer). A batch fully covering a need yields `buyQty = 0` and the row is omitted from the generated list.
- `recipe_versions.servings` null/≤0 → scale `1.0`. Plan entries pinned to an archived version use the pin; entries with no current version and no pin are skipped (counted). A recipe whose compile failed contributes no lines (its `recipe_lines` are gone).
- Multiple plan entries for the same recipe all contribute and sum. An ingredient with several `store-section:*` tags groups under the alphabetically-first.
- Output is always a NEW list (no append). List names are not unique. The preview is a snapshot at the moment of range change — it does not poll; Generate is explicit. 90-day cap is a sanity limit; longer horizons split into multiple lists.

## Acceptance criteria

- [x] `/food/shopping/from-plan` route + "Shopping" sidebar entry placed after "Solve".
- [x] Plan header "Make shopping list" button links to `/food/shopping/from-plan?start=<week-monday>&end=<week-sunday>`.
- [x] Date picker defaults to today + 6 days with a "This week" Mon-Sun snap; plan-entry caption updates on range change.
- [x] Preview groups by section (alpha by label), "Other" last, "Unconverted" last-of-all; rows show ingredient + variant + need/have/buy.
- [x] Uncategorised rows show a [Tag it] link to the ingredient tag editor; unconverted rows render a distinct hint.
- [x] `POST /shopping/preview` returns `GeneratorPreview` in one round-trip; bad range → 400.
- [x] Date validation: `end < start` → `BadDateRange`; range > 90 days → `BadDateRange`; empty list name → `ListNameEmpty`; empty writable set → `NoPlanEntries`.
- [x] Already-cooked entries (`recipe_run_id IS NOT NULL`) and optional lines excluded; canonical-null lines surface one-per-line in Unconverted.
- [x] Pantry subtraction strict by `(variant_id, canonical_unit)`; mismatched units don't subtract; fully-covered needs omitted from the generated list.
- [x] Scaled by `planned_servings / recipe_versions.servings` with 1.0 fallback; same-recipe entries sum.
- [x] `POST /shopping/generate` re-runs the preview, creates a `kind: 'shopping'` list, writes rows in section-then-name order with `notes` provenance, returns `{ ok, listId, itemCount }`.
- [x] Integration tests (`src/api/__tests__/shopping.test.ts`) cover the preview/generate wire envelopes and the cross-pillar write to a stub `ListsClient`; RTL tests (`app/src/pages/shopping/__tests__/FromPlanPage.test.tsx`) cover picker + preview render + Generate flow.

## Out of scope

Substitution-aware pantry subtraction; projected pantry (upcoming cooks producing components); appending to an existing list; multi-store generation; supermarket-pack rounding; per-item cost; LLM "you forgot X" suggestions; recurring templates; expiry-boost; explicit section-header dividers in the list; receipt scanning.
