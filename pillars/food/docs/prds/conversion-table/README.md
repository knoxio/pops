# Conversion Table

**Status: Done.** Schema, resolution, REST contract, compile integration, seed fixtures, and the admin UI ship. The only cross-PRD follow-up (an "Add weight" shortcut from the ingredient detail panel) is not built — see [ideas/conversion-ingredient-panel-shortcut](../../ideas/conversion-ingredient-panel-shortcut.md).

Two seeded lookup tables drive unit conversion for the compile pipeline and an admin CRUD surface:

- `unit_conversions` — universal, context-free conversions (`cup → ml × 240`, `oz → g × 28.35`).
- `ingredient_weights` — per-ingredient "1 of this unit weighs X grams" entries (`flour:plain + cup = 125g`, `salt:table + tsp = 6g`).

The DSL compile reads these via `normaliseLineQty` to populate `recipe_lines.qty_g / qty_ml / qty_count` for non-canonical input units. Without a match, the line stays "unconvertible" (canonical fields null) and compile still succeeds.

## Data Model

### `unit_conversions`

| column       | type                                    | notes                                            |
| ------------ | --------------------------------------- | ------------------------------------------------ |
| `id`         | INTEGER PK                              | autoincrement                                    |
| `from_unit`  | TEXT NOT NULL                           | free text (`cup`, `tbsp`, `oz`); indexed         |
| `to_unit`    | TEXT NOT NULL                           | canonical metric only: `g` \| `ml` \| `count`    |
| `ratio`      | REAL NOT NULL                           | CHECK `ratio > 0`; "1 from_unit = ratio to_unit" |
| `notes`      | TEXT                                    | nullable                                         |
| `is_seeded`  | INTEGER NOT NULL DEFAULT 0              | 1 = seed row (delete-protected)                  |
| `created_at` | TEXT NOT NULL DEFAULT `datetime('now')` |                                                  |

UNIQUE `(from_unit, to_unit)`; index on `from_unit`.

### `ingredient_weights`

| column          | type                                    | notes                                        |
| --------------- | --------------------------------------- | -------------------------------------------- |
| `id`            | INTEGER PK                              | autoincrement                                |
| `ingredient_id` | INTEGER NOT NULL → `ingredients(id)`    | indexed                                      |
| `variant_id`    | INTEGER → `ingredient_variants(id)`     | nullable; null = applies to every variant    |
| `unit`          | TEXT NOT NULL                           | free text (`cup`, `medium`, `clove`, `head`) |
| `grams`         | REAL NOT NULL                           | CHECK `grams > 0`; always grams              |
| `notes`         | TEXT                                    | nullable                                     |
| `is_seeded`     | INTEGER NOT NULL DEFAULT 0              |                                              |
| `created_at`    | TEXT NOT NULL DEFAULT `datetime('now')` |                                              |

UNIQUE on `(ingredient_id, variant_id, unit)`. Because SQLite treats NULL as distinct, the migration adds two partial UNIQUE indexes — `(ingredient_id, variant_id, unit) WHERE variant_id IS NOT NULL` and `(ingredient_id, unit) WHERE variant_id IS NULL` — so the null-variant shape collapses to one row.

## Resolution Algorithm

`resolveCanonicalQty(db, { ingredientId, variantId, unit, qty })` returns a discriminated union (`{ kind:'resolved', canonicalUnit, qty }` or `{ kind:'unresolved' }`):

1. **Identity carry-over** — if `unit` is already `g` / `ml` / `count`, return it unchanged.
2. **`ingredient_weights`** — try `(ingredientId, variantId, unit)`, fall back to `(ingredientId, NULL, unit)`. On hit → `g`, `qty × grams`.
3. **`unit_conversions`** — first row matching `from_unit = unit` (ordered by `id` for determinism). On hit → `to_unit`, `qty × ratio`.
4. **No match** → `unresolved`.

Ingredient-specific weights win over generic conversions. `normaliseLineQty` wraps this: on `unresolved` it returns all-null canonical fields with `canonicalUnit = ingredient.default_unit`.

## REST API (`conversions.*` sub-router)

| method | path                       | purpose                                                            |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| GET    | `/conversions/units`       | list; query `search`, `seededOnly`                                 |
| POST   | `/conversions/units`       | create `{ fromUnit, toUnit, ratio>0, notes? }` → 201               |
| PATCH  | `/conversions/units/:id`   | update `{ ratio?, notes? }`                                        |
| DELETE | `/conversions/units/:id`   | delete (seeded-protected)                                          |
| GET    | `/conversions/weights`     | list; query `ingredientId`, `search`, `seededOnly`                 |
| POST   | `/conversions/weights`     | create `{ ingredientId, variantId?, unit, grams>0, notes? }` → 201 |
| PATCH  | `/conversions/weights/:id` | update `{ grams?, notes? }`                                        |
| DELETE | `/conversions/weights/:id` | delete (seeded-protected)                                          |
| GET    | `/conversions/resolve`     | `{ ingredientId, variantId?, unit, qty }` → resolve result         |

Error mapping: SQLite UNIQUE on create → 409 Conflict; `expectRow` miss on update → 404 Not Found; `SeededRowProtected` on delete → 200 with body `{ ok:false, reason:'seeded' }` (not a 409, so the UI renders a tooltip not a toast); unknown delete id → idempotent 200 `{ ok:true }`. `resolve` always returns 200 (server-side helper consumed by compile; not a write path).

## Business Rules

- `to_unit` is canonical metric only (`g` / `ml` / `count`). One-hop lookups only — no `cup → tbsp → ml` chaining. Add the direct `cup → ml` row instead.
- `from_unit` and `ingredient_weights.unit` are free text; no `tbsp`/`tablespoon` alias normalisation. Same string under different `ingredient_id`s are independent weight rows.
- Resolution is first-match-wins, ingredient-specific beats generic. Compile never raises on a missing conversion — it leaves canonical fields null and continues.
- Seeded rows are delete-protected (the service throws `SeededRowProtected`; the UI disables the delete button). They can be edited; `is_seeded` stays 1. Re-seeding wipes and reinserts seed rows; user-added rows (`is_seeded = 0`) are unaffected.

## Seed Fixtures (`is_seeded = 1`)

`unit_conversions`: weight (`kg`, `mg`, `oz`, `lb` → g), volume (`l`, `cl`, `fl-oz`, `cup`, `tbsp`, `tsp` → ml), count aliases (`each`, `whole`, `piece` → count).

`ingredient_weights`: variant-specific (`flour:plain cup 125g`, `sugar:caster cup 220g`, `sugar:brown cup 200g`, `salt:table tsp 6g`, `salt:table tbsp 18g`) plus a null-variant fallback (`butter cup 227g`). The seed step inserts via the same `createUnitConversion` / `createIngredientWeight` service paths the CRUD UI uses; it is idempotent (orchestrator wipes before re-running, guarded on `slug_registry`).

## Admin UI (`/food/data/conversions`)

Two sub-sections inside the Conversions tab of `/food/data`:

- **Unit conversions** — table (from_unit, to_unit, ratio, seeded?, notes); search by unit name; "Show seeded only" toggle. Add (from_unit free text, to_unit dropdown, ratio, notes), inline edit (ratio + notes), delete.
- **Ingredient weights** — table grouped/sorted server-side by `(ingredient_id, unit)` (ingredient, variant or "any", unit, grams, seeded?, notes); search by unit, filter by ingredient, "Show seeded only" toggle. Add (ingredient picker, variant or "any", unit, grams), inline edit (grams + notes), delete.

Mutations invalidate `listUnits` / `listWeights` and close their dialogs only after server confirmation. Seeded rows show a "seeded" badge and have the delete button disabled (with a `title` + `aria-label` "reseed to restore" tooltip).

## Edge Cases

| case                                                                   | behaviour                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Recipe uses `tablespoon` but only `tbsp → ml` is seeded                | resolution misses; canonical fields null; UI surfaces the unconverted line. Fix: add a `tablespoon → ml` row or normalise the DSL. |
| Two `unit_conversions` rows share a `from_unit`                        | allowed; resolution takes the lowest `id`.                                                                                         |
| `ingredient_weights` row with `variant_id` but no recipe references it | allowed (data-only).                                                                                                               |
| ratio ≤ 0 / grams ≤ 0                                                  | CHECK rejects; create body also enforces `.positive()`.                                                                            |
| `unit` empty string                                                    | rejected by `.min(1)` on the body.                                                                                                 |
| seeded row delete                                                      | service throws `SeededRowProtected`; route returns `{ ok:false, reason:'seeded' }`.                                                |
| unknown id on delete                                                   | idempotent `{ ok:true }`.                                                                                                          |

## Acceptance Criteria

### Schema

- [x] `unit_conversions` and `ingredient_weights` exist with the columns, CHECKs (`ratio > 0`, `grams > 0`, `to_unit IN (g,ml,count)`), UNIQUE constraints, and indexes above; the two partial UNIQUE indexes collapse the null-variant shape correctly.

### Resolution + compile

- [x] `resolveCanonicalQty` returns the discriminated `resolved` / `unresolved` union and covers identity carry-over, ingredient-weight (grams), unit-conversion (ratio), variant-specific-wins, variant→null fallback, and unresolved.
- [x] `normaliseLineQty` maps `unresolved` to all-null canonical fields with `canonicalUnit = ingredient.default_unit`.
- [x] DSL compile calls `normaliseLineQty` per `@ingredient` line (in `compile-lines.ts`) and writes `qty_g` / `qty_ml` / `qty_count` / `canonical_unit` into `recipe_lines`.

### REST contract

- [x] All nine routes (`listUnits`, `createUnit`, `updateUnit`, `deleteUnit`, `listWeights`, `createWeight`, `updateWeight`, `deleteWeight`, `resolve`) exist on `foodConversionsContract` with the bodies/queries above.
- [x] Delete returns `{ ok:false, reason:'seeded' }` (200) for seeded rows and idempotent `{ ok:true }` for unknown ids; create UNIQUE → 409; update miss → 404.

### Seed

- [x] `seedConversions` inserts the `unit_conversions` and `ingredient_weights` fixtures with `is_seeded = 1` via the conversions service, and is idempotent under the wipe-and-reseed contract.

### Admin UI

- [x] `/food/data/conversions` renders both sub-sections; add/edit/delete reflect immediately via list invalidation.
- [x] Seeded rows show a "seeded" badge and a disabled delete button with a reseed-to-restore tooltip; search and "show seeded only" filters work (units: by unit name; weights: by unit + ingredient).

### Tests

- [x] API integration suite asserts the wire envelope + error mapping: unit-conversion list/create/update/delete and weight create/list, plus UNIQUE→409, update-miss→404, empty-unit→400, and the seeded-delete short-circuit. It exercises three resolve paths over the wire (identity carry-over, unresolved, unit-conversion ratio).
- [x] All six resolution paths (identity, ingredient-weight grams, unit-conversion ratio, variant-specific-wins, variant→null fallback, unresolved) are covered by the `normaliseLineQty` resolution unit suite, where the gram-lookup and ratio maths live.
- [x] RTL suite covers both UI sub-sections and the weight row-view hook.
