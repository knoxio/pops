# PRD-108: Batch & Cook Event Model

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the `batches`, `recipe_runs`, and `batch_consumptions` tables — the schemas that make meal-prep tractable. A _batch_ is one specific quantity of an ingredient variant (homemade or purchased) with a provenance pointer, a location, and an optional expiry. A _recipe run_ records that you cooked a specific recipe version with a scaling factor; it consumes batches (via `batch_consumptions`) and, for component recipes, yields a new batch. Extends `ingredient_variants` (PRD-106) with shelf-life defaults so cook events can auto-populate `expires_at`.

This PRD is schema-only. Cook flow UI (mark-cooked, edit yields, place in fridge/freezer) is an Epic 05 PRD. The FIFO consumption ALGORITHM lives in a small helper here; planner/solver logic that USES it lives in Epics 05–07.

## Data Model

### `ingredient_variants` (extension)

Adds two columns via migration:

```sql
ALTER TABLE ingredient_variants ADD COLUMN default_shelf_life_days_fridge INTEGER;
ALTER TABLE ingredient_variants ADD COLUMN default_shelf_life_days_freezer INTEGER;
```

Both nullable. Null = "unknown / shelf-stable". Cook events use these to default `expires_at` when creating a batch; UI may override at cook time.

### `batches`

```sql
CREATE TABLE batches (
  id              INTEGER PRIMARY KEY,
  variant_id      INTEGER NOT NULL REFERENCES ingredient_variants(id),
  qty_remaining   REAL NOT NULL CHECK (qty_remaining >= 0),
  unit            TEXT NOT NULL CHECK (unit IN ('g','ml','count')),
  source_type     TEXT NOT NULL CHECK (source_type IN ('purchase','recipe_run','gift','other')),
  source_id       INTEGER,                       -- polymorphic by source_type; null for 'gift'/'other'
  location        TEXT NOT NULL CHECK (location IN ('pantry','fridge','freezer','other')),
  produced_at     TEXT NOT NULL,
  expires_at      TEXT,                           -- nullable; null = shelf-stable / unknown
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_batches_variant         ON batches(variant_id);
CREATE INDEX idx_batches_location_expiry ON batches(location, expires_at);
CREATE INDEX idx_batches_remaining       ON batches(variant_id) WHERE qty_remaining > 0;
```

One row per "thing in the fridge / pantry / freezer". A 5-pack of canned tomatoes you bought today is one batch with `qty_remaining=5, unit='count'` (or 5 separate batches if each can has its own expiry — convention: one batch per _purchase event_, not per can). A Sunday-cooked pot of patties is one batch with `qty_remaining=12, unit='count'`.

`source_id` is polymorphic by `source_type`:

- `source_type='purchase'`: `source_id` may FK to a purchases table (deferred; v1 leaves null and uses `notes` for receipt reference).
- `source_type='recipe_run'`: `source_id` → `recipe_runs.id`.
- `source_type='gift'` / `'other'`: `source_id` is null.

No FK constraint declared on `source_id` because of polymorphism; integrity is enforced at the service layer.

`qty_remaining` decrements on consumption. Reaches 0 → batch is "empty" but the row persists (for cook history). UI filters empties from the fridge view via the partial index.

### `recipe_runs`

```sql
CREATE TABLE recipe_runs (
  id                 INTEGER PRIMARY KEY,
  recipe_version_id  INTEGER NOT NULL REFERENCES recipe_versions(id),
  planned_for        TEXT,                       -- ISO date if planned in advance
  started_at         TEXT,
  completed_at       TEXT,
  scale_factor       REAL NOT NULL DEFAULT 1.0 CHECK (scale_factor > 0),
  yielded_batch_id   INTEGER REFERENCES batches(id),
  rating             INTEGER CHECK (rating BETWEEN 1 AND 5 OR rating IS NULL),
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recipe_runs_version  ON recipe_runs(recipe_version_id);
CREATE INDEX idx_recipe_runs_planned  ON recipe_runs(planned_for) WHERE planned_for IS NOT NULL;
CREATE INDEX idx_recipe_runs_complete ON recipe_runs(completed_at) WHERE completed_at IS NOT NULL;
```

One row per cook event. `recipe_version_id` pins which version was cooked — so a "too salty" note attached three weeks later still refers to the version actually used.

`scale_factor`: 1.0 means "make the standard recipe". 2.0 = double batch. `yielded_batch_id` set iff the recipe has `yield_qty > 0` AND `completed_at IS NOT NULL` AND the cook actually produced output (the latter is a UI-level distinction — a failed cook can mark `completed_at` without `yielded_batch_id`).

`rating` and `notes` are optional, populated post-cook.

### `batch_consumptions`

```sql
CREATE TABLE batch_consumptions (
  id              INTEGER PRIMARY KEY,
  recipe_run_id   INTEGER NOT NULL REFERENCES recipe_runs(id),
  batch_id        INTEGER NOT NULL REFERENCES batches(id),
  qty_consumed    REAL NOT NULL CHECK (qty_consumed > 0),
  unit            TEXT NOT NULL CHECK (unit IN ('g','ml','count')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_batch_consumptions_run   ON batch_consumptions(recipe_run_id);
CREATE INDEX idx_batch_consumptions_batch ON batch_consumptions(batch_id);
```

One row per (run, batch) draw. Cooking a recipe that needs 200g tomato might consume 200g from batch #42, OR 100g from batch #42 + 100g from batch #67 (FIFO across two opened jars). Each draw is a row.

`qty_consumed` is matched in unit to the batch's `unit` (the consumption helper does any conversion using the recipe_lines' canonical metrics; batch_consumptions only stores in the batch's native unit to avoid double-conversion drift).

## FIFO Consumption Helper

```ts
// packages/app-food/src/services/batch-consumption.ts
export function consumeForRun(
  runId: number,
  needs: ConsumptionNeed[],
  db: SqliteDb
): ConsumptionResult;

export type ConsumptionNeed = {
  variantId: number;
  qty: number; // in canonical metric (from recipe_lines)
  canonicalUnit: 'g' | 'ml' | 'count';
};

export type ConsumptionResult =
  | { ok: true; consumptions: BatchConsumptionRow[] }
  | { ok: false; shortfalls: Shortfall[] };

export type Shortfall = {
  variantId: number;
  needed: number;
  available: number;
  unit: string;
};
```

Algorithm (per `need`):

1. SELECT batches WHERE `variant_id = need.variantId AND qty_remaining > 0` ORDER BY `expires_at NULLS LAST, produced_at ASC` (FIFO by expiry, then by age).
2. Walk the list, decrementing `need.qty` from each batch's `qty_remaining` in turn, recording a `batch_consumptions` row per touch.
3. If `need.qty` reaches 0 before exhausting batches → success.
4. If batches exhausted with `need.qty > 0` remaining → `Shortfall` for that variant.

All updates run in one transaction. Any shortfall rolls back all changes (atomic — either the entire run consumes, or nothing does).

## Business Rules

- Batches deplete monotonically. `qty_remaining` never increases. New stock = new batches row.
- `qty_remaining` reaching 0 does NOT delete the row — kept for cook history continuity.
- `source_id` consistency is service-enforced: `source_type='recipe_run'` requires `source_id` to be a valid recipe_runs.id. No FK in schema (polymorphic), but services validate.
- A `recipe_run` for a component recipe (with `yield_qty > 0`) MUST set `yielded_batch_id` when `completed_at` is set. Enforced by the `markRunComplete` service method: it creates a batch and writes the FK in the same transaction.
- A `recipe_run` for a non-component (`yield_qty = 0`) MUST NOT set `yielded_batch_id`. CHECK is not feasible since `yield_qty` is on a different table; enforced by service.
- FIFO order: `expires_at ASC NULLS LAST, produced_at ASC`. Items with an expiry get consumed first; among those, older first; among shelf-stable, older first.
- Consumption is atomic per cook event. Partial consumption is not modelled — if the cook actually used less than planned, edit the consumption rows directly via an Epic 05 UI.

## Edge Cases

| Case                                                                                     | Behaviour                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cooking a recipe with `optional=true` ingredient line that has no batch                  | Skip silently — optional ingredients don't trigger shortfalls.                                                          |
| Cooking with `scale_factor=0.5` — what's consumed?                                       | Recipe_lines.qty × 0.5; the consumption helper scales `needs` before walking batches.                                   |
| Cooking a recipe that yields 1:count but at scale 2.5 — yielded batch qty?               | 2.5. Decimal counts are allowed; UI may round to a sensible whole when presenting.                                      |
| Two simultaneous cook events depleting the same batch                                    | First-in-the-transaction wins; second sees reduced `qty_remaining` and may shortfall. Optimistic.                       |
| Cook event with `recipe_version_id` pointing at a version with `compile_status='failed'` | Allowed at schema level; service layer rejects with `CannotCookUncompiledRecipe`.                                       |
| Marking a `recipe_run` complete when batches don't exist for required ingredients        | `ConsumptionResult.shortfalls[]` returned; UI surfaces them to user (Epic 05 cook flow).                                |
| Deleting an ingredient_variant with extant batches                                       | FK rejection. Variants must be unused before deletion.                                                                  |
| Batch with `expires_at` in the past                                                      | Still consumable; the helper doesn't filter by expiry. Expiry alerts (deferred — no v1 notifications) read this column. |
| Batch consumed beyond `qty_remaining` (programmer error)                                 | CHECK `qty_remaining >= 0` rejects; transaction rolls back.                                                             |
| Recipe run with no batch_consumptions (e.g. dry-run / planning)                          | Allowed. A run with `started_at IS NULL AND completed_at IS NULL` is "planned only".                                    |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [ ] Migration adds the `ALTER TABLE ingredient_variants` columns (`default_shelf_life_days_fridge`, `default_shelf_life_days_freezer`).
- [ ] Migration adds `batches`, `recipe_runs`, `batch_consumptions` per the SQL above.
- [ ] All CHECKs, FKs, and indexes verified via PRAGMA introspection.
- [ ] `packages/db-types` regenerated; types exported.

### Consumption helper

- [ ] `packages/app-food/src/services/batch-consumption.ts` exports `consumeForRun(runId, needs, db): ConsumptionResult` matching the API above.
- [ ] FIFO ordering verified: a recipe needing 300g, given batch A (200g, expires tomorrow) + batch B (200g, expires next week), consumes 200g from A then 100g from B.
- [ ] Transaction rollback on shortfall: a recipe needing 500g with only 300g available leaves `qty_remaining` unchanged on all batches.
- [ ] Consumption is atomic across multiple `needs[]`: a recipe needing variant X (available) AND variant Y (short) leaves X untouched.

### Recipe-run service

- [ ] `markRunComplete(runId, opts)` creates a yielded batch for component recipes; rejects with `CannotCookUncompiledRecipe` if the version is failed/uncompiled.
- [ ] `expires_at` on the yielded batch defaults to `produced_at + default_shelf_life_days_<location>` from the yield variant, with UI override.

### Invariants

- [ ] Inserting a `batch_consumptions` row with `qty_consumed = 0` fails the CHECK.
- [ ] Inserting a `batch` row with `qty_remaining = -1` fails the CHECK.
- [ ] Inserting a `recipe_run` with `scale_factor = 0` fails the CHECK.
- [ ] Deleting an ingredient_variant with extant batches fails with FK violation.

### Tests

- [ ] Vitest integration suite at `packages/app-food/src/services/__tests__/batches.test.ts` covers each invariant and the FIFO algorithm with multi-batch cases.

## Out of Scope

- Cook-flow UI (mark cooked, edit yields, location picker) — Epic 05 PRD.
- Expiry alerts / notifications — none in v1.
- Pantry view UI (`/food/fridge`) — Epic 05 PRD.
- Multi-output recipes (chicken roast → meat + bones + stock) — deferred per ADR-022 single-yield decision.
- `purchases` table (for `source_type='purchase'` FK) — deferred; v1 uses notes free-form. Likely a cross-domain table shared with finance (theme 02).
- Unit conversion at consumption time — assumes `recipe_lines.qty_g/ml/count` is already canonical; the helper takes those values directly.
- Batch transfer between locations (pantry → fridge) — Epic 05 UI; schema doesn't need anything special (UPDATE on `location`).
