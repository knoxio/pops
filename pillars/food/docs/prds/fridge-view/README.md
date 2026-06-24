# Fridge Inventory View

Status: Partial — the page, both read endpoints, and all five batch lifecycle modals ship. Deferred to [ideas/fridge-view-extensions](../../ideas/fridge-view-extensions.md): URL-driven state + `?batch` deep-link, sidebar expiring badge, >3-variant sub-group collapse, 60s polling, mobile bottom-sheets, prep-state filter chip, prep-aware Cook-now.

`/food/fridge` is the browse-all-batches page: every batch grouped by location, then ingredient, with per-row Edit / Relocate / Adjust qty / Cook now / Delete and a `+ Add batch` action. It is the inventory surface for the meal-prep loop — stand in front of the fridge, see what is there and what is expiring, and jump to a recipe that uses a given leftover. Consumes the batch lifecycle services; introduces no schema of its own.

## REST API surface

Both endpoints are read-only, served under the food pillar's ts-rest contract (`contract/rest-fridge.ts`).

- `POST /fridge/view` — body `{ search?, locations?: ('pantry'|'fridge'|'freezer'|'other')[], expiringSoon?, recipeYieldedOnly?, includeEmpty?, includeDeleted? }`. POST-with-body (not GET) because the filter set carries an array + several booleans. Returns `FridgeView`.
- `GET /fridge/recipes-using-batch?batchId=&limit=` — recipes whose current version references the batch's variant. Returns `{ items: RecipeForCookRow[] }`. Default limit 20, max 100.

The page's lifecycle actions call the batch contract (`contract/rest-batches.ts`), not new endpoints:

- `POST /batches` (Add) · `PATCH /batches/:id` (Edit: expiry / notes / prepState) · `POST /batches/:id/relocate` · `POST /batches/:id/adjust` · `DELETE /batches/:id` (soft-delete).

## Response shapes

```ts
FridgeView = {
  sections: FridgeLocationSection[];          // always all 4 locations, even empty
  counts: { visible: number; empty: number; deleted: number };
};
FridgeLocationSection = { location; count; ingredients: FridgeIngredientGroup[] };
FridgeIngredientGroup = { ingredientId; ingredientName; ingredientSlug; batches: FridgeBatchRow[] };
FridgeBatchRow = {
  id; variantName|null; variantSlug|null; prepStateLabel|null;
  qtyRemaining; unit: 'g'|'ml'|'count'; expiresAt|null; daysToExpiry|null;  // negative = expired N days ago
  producedAt; sourceType; sourceRecipeSlug|null; notes|null; deletedAt|null;
};
RecipeForCookRow = { recipeId; recipeSlug; title; recipeType|null; lineCount; recipeNeedsQty|null; lastCookedAt|null };
```

## `view` server flow

1. SELECT `batches` INNER JOIN `ingredient_variants` / `ingredients`, LEFT JOIN `prep_states`, WHERE: `qty_remaining > 0` unless `includeEmpty`; `deleted_at IS NULL` unless `includeDeleted`; `location IN locations` if given; `expires_at <= now + 7d` (and non-null) if `expiringSoon`; `source_type = 'recipe_run'` if `recipeYieldedOnly`; `LOWER(ingredient.name) LIKE %q%` OR `LOWER(variant.name) LIKE %q%` if `search`.
2. ORDER BY `location, ingredient.name ASC, expires_at IS NULL, expires_at ASC, produced_at ASC` (null expiry sorts last).
3. Resolve `sourceRecipeSlug` in one extra batched query over the `recipe_run` source ids.
4. Group in memory into sections (all four locations padded) → ingredient groups (sorted by name) → rows. `daysToExpiry = round((expiryUtcMidnight − todayUtcMidnight) / 86_400_000)`, computed in UTC calendar days (no date-fns; the math matches `differenceInCalendarDays` for date-only inputs). The `expiringSoon` threshold anchors on an injectable `now` so tests pin the clock deterministically.
5. Separately count visible / empty / deleted (respecting the location filter) for the header.

## `recipes-using-batch` server flow

Look up the batch's `variant_id` + `unit`; if the batch is gone, return `[]`. Then SELECT `recipes` JOIN current `recipe_versions` JOIN `recipe_lines` WHERE `recipe_lines.variant_id = batch.variant_id`, LEFT JOIN `recipe_runs` (completed only) for `MAX(completed_at)`. GROUP BY recipe; ORDER BY `last_cooked_at DESC NULLS LAST, slug ASC`; LIMIT. `recipeNeedsQty = SUM(qty_g|qty_ml|qty_count)` over lines whose `canonical_unit` matches the batch unit — null when no matching-unit line exists. The join is variant-only and deliberately not prep-aware (the prep-aware solver is deferred).

## Page

Route `/food/fridge` (`FridgePage`), registered in the food app manifest with a "Fridge" sub-nav entry.

- **Header**: title "Fridge", a "What can I cook?" link, and a `+ Add batch` button.
- **Filter bar**: search input (200ms debounce, case-insensitive substring over ingredient + variant name); location chips (multi-select, default all); Expiring-soon toggle (`expires_at <= today + 7d`); Recipe-yielded toggle (`source_type='recipe_run'`); show-all text-link revealing empty + soft-deleted rows, captioned with the hidden count.
- **Sectioned list**: one collapsible section per location, header `▾ <Location> (<count>)`. Collapsed state persists per-location in `localStorage`. Within a section, batches are listed under each ingredient name (flat). Empty sections render collapsed placeholders.
- **Row**: `<Ingredient> / <Variant> / <prep>` (variant/prep omitted when null), human-readable qty (`1.2 kg` ≥1000, else `200 g`/`ml`/`3 ct`), expiry ("Exp … (in 2d)" / "(expired 3d ago)", `—` when null). Warning icon for batches expiring within 3 days; expired icon for already-expired. Empty rows tagged "· empty", soft-deleted "· deleted" + dimmed with the kebab disabled. Recipe-yielded rows show "· from `<slug>`". Each row carries `data-batch-id`.
- **Kebab menu**: Edit, Relocate, Adjust qty, Cook now, Delete.
- **Empty state**: "Nothing in the fridge yet. Click + Add batch or cook a recipe to fill it."

### Modals (each calls a batch lifecycle endpoint)

- **Add batch** — ingredient picker (required), variant picker (filtered to ingredient, required), prep-state picker (optional), qty + unit (defaults to variant `default_unit`, override allowed), source-type radio (Purchase / Gift / Other — no `recipe_run`), location radio (default Fridge), produced-at (default today), expires-at, notes (textarea capped at 500 chars; the contract accepts up to 1000). Submits `POST /batches`.
- **Edit** — same shape, pre-filled, with ingredient / variant / source / produced-at / location / qty disabled or hidden (those route through Relocate / Adjust). Prep-state editable only when `source_type != 'recipe_run'` (server `CannotEditFromRun`). Editable: expires-at, notes, prep-state. Submits `PATCH /batches/:id`. Bad expiry (earlier than produced-at) → inline error from server `BadExpiry`.
- **Relocate** — location radio (current pre-selected). Submits `POST /batches/:id/relocate`; server re-applies the location's expiry default per the relocation rule.
- **Adjust qty** — read-only current qty, signed delta input, reason radio (Spoiled / Wasted / Correction). Spoiled / Wasted require `delta < 0`; Correction allows any sign. Submits `POST /batches/:id/adjust`; `NegativeQty` → inline retry.
- **Delete** — confirm with qty + variant; distinct wording for non-empty ("still has N remaining…") vs empty. Submits `DELETE /batches/:id` (soft-delete: sets `deleted_at` and forces `qty_remaining = 0`). A delete on an already-deleted batch is rejected with `BatchDeleted` (the service guards on `deleted_at IS NULL`), so the row's kebab is disabled once deleted.
- **Cook now** — "What can you cook with this batch?" lists `recipes-using-batch` results, each showing "Needs ~Xg" (or "Needs ~?" when no matching-unit line) and last-cooked date; clicking navigates to `/food/recipes/:slug`. Empty → "No recipes use this batch's ingredient yet" with a link to create one.

## Business rules

- Default view: `qty_remaining > 0 AND deleted_at IS NULL`, all locations, no filters.
- Thresholds are code constants, not user-configurable: 7 days for the expiring-soon filter, 3 days for the row warning icon.
- Empties and soft-deleted rows are hidden by default but reachable via show-all. Soft-deleted batches never enter FIFO consumption.
- All four locations always appear (empty ones show `(0)` and collapsed).
- No pagination in v1 — a long fridge is a single scroll managed by section collapse.
- A batch may be stored in a unit other than its variant's `default_unit`; the row renders the stored unit, and FIFO only matches same-unit needs.

## Acceptance criteria

- [x] `POST /fridge/view` returns `FridgeView` (sections by location → ingredient → batch, plus visible/empty/deleted counts) honouring every filter in a single SELECT (no N+1; one extra batched query for recipe slugs).
- [x] Default filter set excludes empties and soft-deleted rows; `includeEmpty` / `includeDeleted` reveal them.
- [x] Rows sort by `expires_at ASC` with null expiry last, then `produced_at ASC`; `daysToExpiry` is UTC calendar-day math and negative when expired.
- [x] `GET /fridge/recipes-using-batch` returns variant-matched recipes sorted by `last_cooked_at DESC NULLS LAST`, with `recipeNeedsQty` summed over matching-unit lines (null when none); missing batch → empty list.
- [x] `/food/fridge` route + "Fridge" nav entry registered in the food app manifest.
- [x] Header search (200ms debounce), location chips, expiring-soon + recipe-yielded toggles, and show-all link all drive the view.
- [x] Sections collapsible per location with state persisted in `localStorage`; all four locations always rendered.
- [x] Rows show ingredient/variant/prep, human-readable qty, expiry with warning/expired icons, and a kebab menu (disabled on deleted rows).
- [x] Empty-state copy matches spec.
- [x] Add modal validates required fields and calls `POST /batches`.
- [x] Edit modal pre-fills, disables ingredient/variant/qty/location, and honours `CannotEditFromRun` for prep-state.
- [x] Relocate / Adjust-qty / Delete / Cook-now modals call their respective endpoints; Adjust enforces reason/sign; Delete distinguishes empty vs non-empty wording.
- [x] Cook-now picker renders `recipes-using-batch` results sorted by recent cook, with the variant-only imprecision surfaced as "Needs ~".

## Edge cases

- Variant with no shelf-life defaults → `expires_at` stays null → row shows `—`.
- Expiring-soon filter with zero hits → filtered empty view.
- Cook-now on a variant used in no recipes → "No recipes use this batch's ingredient yet" + create link.
- Two tabs deleting the same batch → first succeeds; the second is rejected with `BatchDeleted` (`deleted_at` already set) and the modal surfaces that reason inline.
- `daysToExpiry` across a DST boundary → UTC calendar-day math, unaffected by local DST.
