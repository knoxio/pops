# PRD-123: Conversion Table Schema & Admin

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Define the schema and admin UI for unit conversion. Two tables:

- `unit_conversions` — universal, context-free conversions (`cup → ml = 240`, `tbsp → ml = 15`, `oz → g = 28.35`).
- `ingredient_weights` — per-ingredient "1 of this unit weighs X grams" entries (`onion + medium = 150g`, `egg + large = 60g`).

PRD-116's compile uses these tables to populate `recipe_lines.qty_g / qty_ml / qty_count` for non-canonical input units. Without this PRD, compile only handles g/ml/count carry-over and any other unit leaves the canonical fields null (acceptable degraded mode for the shopping-list and pantry math). This PRD also upgrades PRD-116's normalisation step to consult these tables.

Admin UI lives in the Conversions tab of `/food/data` (PRD-122 reserved the slot).

## Data Model

### `unit_conversions`

```sql
CREATE TABLE unit_conversions (
  id           INTEGER PRIMARY KEY,
  from_unit    TEXT NOT NULL,
  to_unit      TEXT NOT NULL CHECK (to_unit IN ('g','ml','count')),
  ratio        REAL NOT NULL CHECK (ratio > 0),
  notes        TEXT,
  is_seeded    INTEGER NOT NULL DEFAULT 0,        -- 1 for seed rows; user-added = 0
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_unit, to_unit)
);
CREATE INDEX idx_unit_conversions_from ON unit_conversions(from_unit);
```

Each row: "1 unit of `from_unit` equals `ratio` of `to_unit`". `to_unit` is always one of the canonical metric units (`g` / `ml` / `count`). Lookups are one-hop: given an input unit, find the row matching `(from_unit, *)` and apply.

`is_seeded` marks rows from the PRD-113 seed so re-seeding doesn't duplicate user-added rows. PRD-113's seed populates rows for the common cooking units (cup, tbsp, tsp, oz, lb, fl-oz, l, kg, mg).

### `ingredient_weights`

```sql
CREATE TABLE ingredient_weights (
  id              INTEGER PRIMARY KEY,
  ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id),
  variant_id      INTEGER REFERENCES ingredient_variants(id),   -- nullable; null = applies to all variants
  unit            TEXT NOT NULL,
  grams           REAL NOT NULL CHECK (grams > 0),
  notes           TEXT,
  is_seeded       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ingredient_id, variant_id, unit)
);
CREATE INDEX idx_ingredient_weights_ingredient ON ingredient_weights(ingredient_id);
```

Each row: "1 `unit` of ingredient X (optionally pinned to variant Y) weighs `grams`". `unit` is whatever the user calls it (`medium`, `large`, `clove`, `head`, `cup-diced`, `slice`). `grams` is always in grams (we don't model ingredient-specific volume → weight; if you need that, encode as `cup-diced → 150` and let the renderer label it).

`variant_id` nullable: most weights are per-ingredient (medium onion is medium onion regardless of yellow/red variant). When a variant materially differs (a Roma tomato has different weight than a beefsteak), the per-variant row wins. Resolution: first try `(ingredient_id, variant_id, unit)`; fall back to `(ingredient_id, NULL, unit)`.

## Resolution Algorithm

When PRD-116's compile encounters a recipe line with `original_unit` not in `{g, ml, count}`:

1. **Try `ingredient_weights`** for this line's ingredient/variant/unit combo. If found → multiply `original_qty × grams` → set `qty_g`, `canonical_unit='g'`. Done.
2. **Try `unit_conversions`** with `(from_unit=original_unit, *)`. If found → multiply `original_qty × ratio` → set the appropriate `qty_*` column based on `to_unit`. Done.
3. **No match** → leave `qty_g/ml/count` all null; set `canonical_unit` to the ingredient's `default_unit`. Compile succeeds; the row is "unconvertible" — shopping-list aggregation silently skips it. UI shows the original text and a small "(unconverted)" badge.

The resolution prefers the more-specific table (`ingredient_weights`) over the generic one — a recipe line `@ingredient(1, onion:yellow, 2:medium)` resolves "medium" via ingredient_weights (onion + null variant + medium → 150g), not unit_conversions.

## Conversions Tab UI (`/food/data/conversions`)

Two sub-sections.

### Sub-section A: Unit conversions

Table view, columns: from_unit, to_unit, ratio, seeded?, notes.

Filters: search by unit name; "Show seeded only" toggle.

Actions:

- **Add**: form with from_unit (free text, autocomplete from existing rows), to_unit (g / ml / count dropdown), ratio (number), notes (optional).
- **Edit**: inline ratio + notes edit.
- **Delete**: row action. Hard-blocks seeded rows in the UI (with a tooltip "Seeded conversion; reseed to restore"). User-added rows can be deleted freely.

### Sub-section B: Ingredient weights

Table view grouped by ingredient (rows sort `(ingredient_id, unit)` server-side). Columns: ingredient, variant (or "any"), unit, grams, seeded?, notes.

Filters: search by unit name; filter by ingredient; "Show seeded only" toggle.

Actions:

- **Add**: form with ingredient picker, variant picker (or "any"), unit (free text), grams (number).
- **Edit**: inline grams + notes.
- **Delete**: row action.
- **From ingredient detail panel** (PRD-122): a "Add weight" button on the ingredient panel jumps here pre-focused.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extended)
export const conversionsRouter = {
  listUnits: query({ input: { search?: string, seededOnly?: boolean }, output: { items: UnitConversionRow[] } }),
  createUnit: mutation({ input: { fromUnit: string, toUnit: 'g'|'ml'|'count', ratio: number, notes?: string }, output: { id: number } }),
  updateUnit: mutation({ input: { id: number, ratio?: number, notes?: string }, output: { ok: true } }),
  deleteUnit: mutation({ input: { id: number }, output: { ok: true } | { ok: false, reason: 'seeded' } }),

  listWeights: query({ input: { ingredientId?: number, search?: string }, output: { items: IngredientWeightRow[] } }),
  createWeight: mutation({ input: { ingredientId: number, variantId?: number, unit: string, grams: number, notes?: string }, output: { id: number } }),
  updateWeight: mutation({ input: { id: number, grams?: number, notes?: string }, output: { ok: true } }),
  deleteWeight: mutation({ input: { id: number }, output: { ok: true } }),

  // Resolution helper exposed for PRD-116's compile (server-side use)
  resolve: query({
    input: { ingredientId: number, variantId?: number, unit: string, qty: number },
    output: { canonicalUnit: 'g'|'ml'|'count', qty: number } | { unresolved: true },
  }),
};
```

`conversionsRouter.resolve` is the procedure PRD-116's compile calls. Public for testing; not exposed via OpenAPI to clients (server-only contract).

## PRD-116 Upgrade

PRD-116 (Materialisation) step 9 currently says "v1 the conversion is identity-or-null". This PRD upgrades step 9 to consult `unit_conversions` and `ingredient_weights` per the resolution algorithm above. Specifically:

- The compile function imports a helper `normaliseLineQty(line, db): { qty_g, qty_ml, qty_count, canonical_unit }` from `packages/app-food/src/dsl/normalisation.ts`.
- The helper runs the 3-step resolution. Returns canonical values OR all-null with `canonical_unit` set to the ingredient's `default_unit`.
- Compile writes the returned values into the `recipe_lines` row.

PRD-116's acceptance criteria are extended (here, not by reopening PRD-116) with:

- [ ] Conversion v1 path: ingredient with `original_unit='cup'` and `unit_conversions(cup, ml, 240)` exists → `qty_ml = original_qty × 240`.
- [ ] Per-ingredient weight: `original_unit='medium'` and `ingredient_weights(onion, null, medium, 150)` exists → `qty_g = original_qty × 150`.
- [ ] Variant-specific weight wins over null-variant weight when both exist for the same `(ingredient, unit)`.
- [ ] Unresolved unit: `original_unit='packets'` with no matching row → `qty_*` all null, `canonical_unit = ingredient.default_unit`. Compile still succeeds.

## Seed Data (PRD-113 extension)

PRD-113's seed needs to insert the following `unit_conversions` rows (all `is_seeded=1`):

| from_unit | to_unit | ratio  | Notes             |
| --------- | ------- | ------ | ----------------- |
| `cup`     | `ml`    | 240    | US cup            |
| `tbsp`    | `ml`    | 15     |                   |
| `tsp`     | `ml`    | 5      |                   |
| `fl-oz`   | `ml`    | 29.57  | US fluid ounce    |
| `l`       | `ml`    | 1000   |                   |
| `oz`      | `g`     | 28.35  | Avoirdupois ounce |
| `lb`      | `g`     | 453.59 |                   |
| `kg`      | `g`     | 1000   |                   |
| `mg`      | `g`     | 0.001  |                   |
| `each`    | `count` | 1      |                   |
| `whole`   | `count` | 1      |                   |

Plus selected `ingredient_weights` (small set; `is_seeded=1`):

| Ingredient | Variant | Unit   | Grams |
| ---------- | ------- | ------ | ----- |
| onion      | (any)   | medium | 150   |
| onion      | (any)   | large  | 200   |
| onion      | (any)   | small  | 100   |
| egg        | large   | each   | 60    |
| egg        | medium  | each   | 50    |
| garlic     | (any)   | clove  | 5     |
| garlic     | (any)   | head   | 50    |
| lemon      | (any)   | each   | 100   |

PRD-113 updates its fixture-set section to include these inserts. (Logged as an open update to PRD-113's content when this PRD is implemented.)

## Business Rules

- `to_unit` is canonical metric only (`g` / `ml` / `count`). No `cup → fl-oz` conversions stored; that's a two-hop the system doesn't do. Add the relevant `cup → ml` and `fl-oz → ml` separately if needed; cooking math is metric-out.
- `from_unit` is free text. Whatever the recipe DSL uses, the conversion table can match. No normalisation of `tbsp` vs `tablespoon` — those would be two separate rows (or use an `unit_aliases` table; deferred).
- `ingredient_weights.unit` is also free text. `medium` for onion, `medium` for tomato — same string, different rows (per-ingredient scoping via `ingredient_id`).
- Resolution is "first match wins, ingredient-specific beats generic". Compile never raises an error for a missing conversion — it leaves canonical fields null and continues.
- Seeded rows are protected in the UI from deletion. They can be edited (ratio adjustment is reasonable). Re-seeding (PRD-113 task) overwrites seeded rows but doesn't touch user-added rows.

## Edge Cases

| Case                                                                             | Behaviour                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipe uses `tablespoon` (not `tbsp`); only `tbsp → ml` is seeded                | Resolution misses; canonical fields null. User can either: (a) add a `tablespoon → ml = 15` row, or (b) edit the recipe DSL to use `tbsp`. UI surfaces the unconverted line to nudge action.    |
| Two rows in `unit_conversions` with the same `from_unit` but different `to_unit` | Allowed (e.g. `cup → ml` AND `cup → g` if someone really wants flour-by-cup-in-grams). Resolution picks the one whose `to_unit` matches the ingredient's `default_unit` first.                  |
| `ingredient_weights` with `variant_id` set but variant has no recipe lines       | Allowed (data-only). Doesn't affect anything until a recipe references it.                                                                                                                      |
| Conversion ratio of 0                                                            | CHECK rejects (`ratio > 0`).                                                                                                                                                                    |
| User deletes a seeded row via direct SQL bypass                                  | Out of scope to defend; the UI protects, that's where this PRD enforces.                                                                                                                        |
| Editing a seeded row's `ratio`                                                   | Allowed. The row is no longer "stock" — but `is_seeded` stays 1 (the SOURCE of the row was the seed; the value happens to be different). Re-seeding will overwrite back to the canonical ratio. |
| Recipe re-compile after adding a new conversion row                              | Re-compile picks up the new conversion. PRD-119's edit page triggers re-compile on save. Bulk re-compile of all recipes is a future PRD.                                                        |
| `original_unit` is an empty string                                               | Treated as no unit; resolution leaves canonical fields null, `canonical_unit = ingredient.default_unit`.                                                                                        |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `unit_conversions` and `ingredient_weights` per the SQL above. (`0066_prd_123_conversions.sql`. NULL-distinct UNIQUE on `ingredient_weights` split into two partial uniques — `(ingredient_id, variant_id, unit) WHERE variant_id IS NOT NULL` + `(ingredient_id, unit) WHERE variant_id IS NULL` — so the null-variant shape collapses correctly under SQLite's NULL-distinct semantics.)
- [x] Indexes and UNIQUE constraints verified via PRAGMA. (covered by the invariant suite running both partial uniques + the CHECK on `to_unit` and `ratio > 0` / `grams > 0`.)
- [x] `packages/db-types` regenerated.

### Resolution helper

- [x] `packages/app-food/src/dsl/normalisation.ts` exports `normaliseLineQty(db, input)` per the algorithm above.
- [x] Vitest suite at `packages/app-food/src/dsl/__tests__/normalisation.test.ts` covers:
  - Identity carry-over: input g → qty_g equals original_qty.
  - Unit conversion: input cup → qty_ml = original_qty × 240.
  - Ingredient weight: input medium onion → qty_g = original_qty × 150.
  - Variant-specific weight wins over null-variant.
  - Unresolved: input `packets` → all canonical fields null.

### PRD-116 integration

- [x] PRD-116's compile invokes `normaliseLineQty` for each line during step 9. (via `compile-lines.ts` `buildLineInsert` — the old `carryOverMetric` is replaced.)
- [ ] After this PRD ships, re-running PRD-113's seed produces `recipe_lines` rows with populated `qty_g`/`qty_ml`/`qty_count` for sample recipes whose DSL uses `cup` / `tbsp` / `medium` units. _Pending PRD-113 Phase 2 + seed integration below._

### tRPC procedures

- [x] All procedures in the API section exist in `apps/pops-api/src/modules/food/`. (`conversionsRouter` mounted under `food.conversions` — `apps/pops-api/src/modules/food/conversions/router.ts`. Services consumed from `@pops/app-food-db`: `conversionsService` for mutations + `resolveCanonicalQty`, `conversionsQueries` for the paginated list helpers. Shared error mapping in `apps/pops-api/src/modules/food/conversions/error-mapping.ts`.)
- [x] `deleteUnit` returns `{ ok: false, reason: 'seeded' }` for seeded rows. (`deleteWeight` mirrors the same contract via `runDelete`. Other error mappings: SQLite UNIQUE → tRPC `CONFLICT` on create (`runCreate`); `expectRow` miss → tRPC `NOT_FOUND` on update (`runUpdate`); unknown-id deletes return `{ ok: true }` to match Phase A's idempotent contract.)

### Admin UI

- [x] `/food/data/conversions` route renders both sub-sections (Unit conversions, Ingredient weights). (Phase C — `packages/app-food/src/pages/data/conversions-tab/`. The route slot was reserved by PRD-122-A; Phase C swapped the placeholder for the real `ConversionsTabContents`.)
- [x] Add / edit / delete actions work via tRPC and reflect immediately. (Per-mutation `food.conversions.listUnits`/`listWeights` invalidation; create/update close their dialogs only after the server confirms via per-call `onSuccess` callbacks.)
- [x] Seeded rows show a "seeded" badge and have the delete button disabled. (Disabled button + `title=` tooltip + `aria-label` carrying "Seeded conversion/weight; reseed to restore" — `<span tabIndex={0}>` Tooltip-wrap pattern rejected because it tripped `jsx-a11y/no-noninteractive-tabindex`.)
- [x] Search filters work. (Units: search by `from_unit`/`to_unit`. Weights: search by `unit` + filter by ingredient. Both sub-sections also expose the "Show seeded only" toggle.)
- [ ] Ingredient detail panel (PRD-122) has an "Add weight" button that opens the relevant form here. _Deferred — owned by whichever 122-B follow-up (122-B2 or later) lands second after PRD-123 Phase C, to avoid two simultaneous in-flight branches amending the same `IngredientDetailPanel`._

### Seed integration

- [ ] PRD-113's seed task inserts the unit_conversions rows from the table above.
- [ ] PRD-113's seed task inserts the ingredient_weights rows from the table above.
- [ ] Re-running the seed is idempotent on seeded rows (updates ratio/grams back to canonical if changed).

### Tests

- [x] Vitest integration suite at `apps/pops-api/src/modules/food/__tests__/conversions-router.test.ts`. (24 cases: 4 list-units, 3 create-unit incl. UNIQUE→CONFLICT, 2 update-unit incl. unknown→NOT_FOUND, 3 delete-unit incl. idempotent-unknown + seeded short-circuit, 6 weight CRUD/listing + seededOnly toggle + UNIQUE→CONFLICT, 1 seeded-weight short-circuit, 1 unknown-weight→NOT_FOUND, and 6 resolve paths covering identity / unit-conversions / ingredient-weight wins / variant-specific wins / variant→null fallback / unresolved.)
- [x] Vitest + RTL suite for the Conversions tab UI. (Phase C — `packages/app-food/src/pages/data/conversions-tab/__tests__/`: `UnitsSection.test.tsx` 7 cases, `WeightsSection.test.tsx` 7 cases, `useWeightRowViews.test.ts` 3 cases. 17 cases total.)

## Out of Scope

- Two-hop conversions (e.g. `cup → tbsp → ml`) — keep it one hop. Users add what they need.
- Density-driven volume → weight inference (`packages/app-food` knows `ingredients.density_g_per_ml`; could compute "1 cup of olive oil = 240 ml × 0.91 = 218g" automatically). Maybe worth a future enhancement; v1 requires explicit rows.
- Bulk re-compile of all recipes after a conversion change — deferred. v1 only recompiles on next manual save.
- Unit-name aliases (`tbsp` = `tablespoon`) — defer to a future small PRD or to the conversion table itself (add both rows manually).
- Locale-aware units (US cup vs UK cup — 240 vs 250 ml) — v1 picks US cup; user can edit the seeded value. Future PRD could add locale preferences.
- Currency-style rounding or precision settings — v1 stores REAL and displays with sensible precision (2 decimal places for grams, 0-1 for ml depending on magnitude).
- Cross-ingredient weight inference ("a medium tomato weighs as much as a medium onion") — out of scope.
