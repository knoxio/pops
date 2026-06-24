# Batch & Cook-Event Model

Status: Done — schema, FIFO consumption helper, and recipe-run completion service all shipped. The lifecycle/fridge/cook REST surfaces that sit on top of this data model are owned by sibling PRDs (`batch-lifecycle`, `fridge-view`, `cook-event-recording`); this PRD owns the three tables, the shelf-life extension, the `consumeForRun` FIFO drain, and `markRunComplete`.

## Purpose

The three tables that make meal-prep tractable. A **batch** is one specific quantity of an ingredient variant (homemade or purchased) with a provenance pointer, a location, and an optional expiry — one row per thing in the fridge / pantry / freezer. A **recipe run** records that a specific recipe version was cooked at a scaling factor; it consumes batches (via **batch consumptions**) and, for component recipes, yields a new batch. `ingredient_variants` carries shelf-life defaults so cook events auto-populate `expires_at`.

The food pillar owns its own SQLite DB and serves these tables through its ts-rest contract (`pillars/food/src/contract/rest-batches.ts`, registered on the `batches` sub-router of `rest.ts`). FIFO consumption is a service helper, not a wire procedure.

## Data Model

`ingredient_variants` (defined in `db/schema/food-ingredients.ts`) carries two nullable columns — `default_shelf_life_days_fridge`, `default_shelf_life_days_freezer`. Null = unknown / shelf-stable. Cook events read these to default `expires_at`; the UI may override at cook time.

`batches` — one row per fridge/pantry/freezer slot:

- `variant_id` → `ingredient_variants(id)` (FK, NOT NULL).
- `prep_state_id` → `prep_states(id)`, nullable. Carries through from the cook event's yield prep state or from manual entry. Two batches of the same variant but different prep states (`chicken:breast:shredded` vs `:sliced`) are distinct slots that FIFO-consume independently. Null = default/whole.
- `qty_remaining` REAL, NOT NULL, `CHECK >= 0`. Depletes monotonically; never increases. Reaching 0 leaves the row in place (cook history).
- `unit` TEXT, `CHECK IN ('g','ml','count')`.
- `source_type` TEXT, `CHECK IN ('purchase','recipe_run','gift','other')`.
- `source_id` INTEGER, polymorphic by `source_type` — `recipe_run` → `recipe_runs.id`; `gift`/`other` → null; `purchase` → null in v1 (no purchases table). No FK declared; integrity is service-enforced.
- `location` TEXT, `CHECK IN ('pantry','fridge','freezer','other')`.
- `produced_at` TEXT NOT NULL, `expires_at` TEXT nullable (null = shelf-stable / unknown).
- `notes` TEXT, `deleted_at` TEXT nullable (soft-delete; every `deleted_at IS NOT NULL` row also has `qty_remaining = 0`, service-enforced).
- `created_at` TEXT NOT NULL default `datetime('now')`.
- Indexes: `(variant_id, prep_state_id)`, `(location, expires_at)`, and partial `(variant_id, prep_state_id) WHERE qty_remaining > 0`.

`recipe_runs` — one row per cook event:

- `recipe_version_id` → `recipe_versions(id)` (FK, NOT NULL) — pins which version was cooked, so a late note still refers to the version actually used.
- `started_at`, `completed_at` TEXT nullable. A run with both null is "planned only".
- `scale_factor` REAL NOT NULL default 1.0, `CHECK > 0`. 1.0 = standard recipe; 2.0 = double batch.
- `yielded_batch_id` → `batches(id)` (FK, nullable) — set iff a component cook produced output.
- `rating` INTEGER, `CHECK rating IS NULL OR rating BETWEEN 1 AND 5`. `notes` TEXT.
- `created_at` TEXT NOT NULL default `datetime('now')`.
- Indexes: `(recipe_version_id)`, partial `(completed_at) WHERE completed_at IS NOT NULL`.
- No `planned_for` column. The plan→cook link lives on `plan_entries.recipe_run_id`; the planned date is read via JOIN. Ad-hoc cooks have no planned date.

`batch_consumptions` — one row per (run, batch) draw:

- `recipe_run_id` → `recipe_runs(id)`, `batch_id` → `batches(id)` (both FK, NOT NULL).
- `qty_consumed` REAL NOT NULL, `CHECK > 0`. `unit` TEXT, `CHECK IN ('g','ml','count')` — matched to the batch's native unit (no cross-unit conversion stored).
- `created_at` TEXT NOT NULL default `datetime('now')`.
- Indexes: `(recipe_run_id)`, `(batch_id)`.
- A 200g tomato need can become 200g from one batch or 100g + 100g across two opened jars (FIFO) — each draw is a row.

## REST API Surface (this domain)

- `POST /batches` — create a manual batch (`purchase`/`gift`/`other` source). 201 `{ batchId }` or 400. Auto-derives `expires_at` from the variant's shelf-life default for the location unless overridden; rejects `expires_at` before `produced_at` (`BadExpiry`).
- `GET /batches/:id` — a batch with resolved variant / ingredient / source (incl. `sourceRecipeRunId`, `sourceRecipeSlug`).
- `POST /batches/search-for-consume` — FIFO-ordered batches for the consume/override picker, filterable by ingredient / variant / location / `qtyGreaterThan`. POST so the literal path can't be shadowed by `GET /batches/:id`.

The relocate / edit / adjust / delete lifecycle mutations (`batch-lifecycle`), the `/fridge/*` view (`fridge-view`), and the `/cook/*` flow (`cook-event-recording`) are served from the same contract but specified in sibling PRDs.

## Service Layer

`consumeForRun(db, runId, needs): ConsumptionResult` (`db/services/batches.ts`) — FIFO drain in one transaction.

- `ConsumptionNeed = { variantId, prepStateId: number|null, qty, canonicalUnit }`.
- Result is a discriminated union: `{ ok: true, consumptions }` or `{ ok: false, shortfalls }` where each `Shortfall = { variantId, prepStateId, needed, available, unit }`.
- Per need: select `WHERE variant_id = ? AND prep_state_id IS ? AND unit = ? AND qty_remaining > 0` ordered by `expires_at IS NULL, expires_at ASC, produced_at ASC` (expiry-soonest first, NULLs last, then oldest). Walk the list, decrementing each batch and writing a `batch_consumptions` row per touch.
- Any per-need shortfall throws a sentinel that rolls back **every** decrement — the whole run consumes atomically or nothing does.
- `prep_state_id` is matched with SQLite `IS` so a null need only matches null batches. Strict buckets: a `diced` line does not draw from `whole` batches.

`markRunComplete(db, runId, opts)` (`db/services/recipe-runs.ts`) — finalise a run in one transaction.

- Sets `completed_at` (defaults to now). When `opts.yield` is present, inserts the produced batch with `source_type='recipe_run'`, `source_id=runId`, and writes its id back to `recipe_runs.yielded_batch_id`; yieldless cooks leave it null.
- Yielded `expires_at` defaults to `produced_at + default_shelf_life_days_<location>` for `fridge`/`freezer`, null for `pantry`/`other` or when the variant has no default; `opts.yield.expiresAt` overrides.
- Refuses a run whose `recipe_version.compile_status != 'compiled'` → `CannotCookUncompiledRecipe`.
- `createBatchFromRun(db, runId, yieldArgs|null)` (`db/services/batches-lifecycle.ts`) wraps `markRunComplete` as the single batch-creation entry point for the cook flow.

## Business Rules

- Batches deplete monotonically; new stock = a new row. Reaching 0 never deletes the row.
- `source_type='recipe_run'` requires `source_id` to be a valid `recipe_runs.id` (service-enforced; no FK because polymorphic).
- A component-recipe run (`yield_qty > 0`) sets `yielded_batch_id` on completion; a non-component run must not. Enforced by the service, not a CHECK (`yield_qty` lives on a different table).
- Soft-delete invariant: `deleted_at IS NOT NULL → qty_remaining = 0`, held at every observable point by a single UPDATE in `deleteBatch`. FIFO naturally skips deleted rows via `qty_remaining > 0`.
- Consumption is atomic per cook event; partial consumption is corrected by editing consumption rows, not modelled here.

## Edge Cases

- Optional ingredient line with no batch → skipped silently, no shortfall.
- `scale_factor = 0.5` → needs scaled before walking batches; decimal yields allowed (UI rounds for display).
- Two concurrent cooks on one batch → first-in-the-transaction wins; the second sees reduced qty and may shortfall (optimistic).
- Run pointing at a `failed`/`uncompiled` version → `CannotCookUncompiledRecipe`.
- `expires_at` in the past → still consumable; the helper does not filter by expiry.
- Consuming below 0 (programmer error) → `CHECK qty_remaining >= 0` rejects, transaction rolls back.
- Deleting a variant with extant batches → FK rejection.
- Run with no consumptions and no `started_at`/`completed_at` → valid "planned only" row.

## Acceptance Criteria

- [x] `ingredient_variants` carries nullable `default_shelf_life_days_fridge` / `default_shelf_life_days_freezer`.
- [x] `batches`, `recipe_runs`, `batch_consumptions` exist with all CHECKs (enum columns; `qty_remaining >= 0`, `qty_consumed > 0`, `scale_factor > 0`, `rating BETWEEN 1 AND 5 OR NULL`), FKs, and the two partial indexes (`idx_batches_remaining WHERE qty_remaining > 0`, `idx_recipe_runs_complete WHERE completed_at IS NOT NULL`).
- [x] Inserting `qty_consumed = 0`, `qty_remaining = -1`, or `scale_factor = 0` fails the CHECK; deleting a variant with extant batches fails with an FK violation.
- [x] `consumeForRun` returns the discriminated union, draws expiry-soonest then oldest, spills across batches, and rolls back every decrement on any per-need shortfall (single-need and multi-need atomicity).
- [x] A `null` prep-state need matches only null-prep batches; `diced` needs never draw from `whole` batches.
- [x] `markRunComplete` creates the yielded batch + writes `yielded_batch_id` only when `opts.yield` is given; rejects uncompiled versions with `CannotCookUncompiledRecipe`.
- [x] Yielded `expires_at` auto-fills from the variant shelf-life default for fridge/freezer, stays null for pantry, and is overridable via `opts.yield.expiresAt`.
- [x] Soft-delete holds `deleted_at IS NOT NULL → qty_remaining = 0`; deleted batches are skipped by FIFO.
- [x] `POST /batches` (manual), `GET /batches/:id` (resolved), and `POST /batches/search-for-consume` (FIFO-ordered) are served from the `batches` sub-router.

## Deferred

Forward-looking extensions to this data model live in `../../ideas/batch-model-extensions.md`: a `purchases` table for `source_type='purchase'` provenance, expiry alerts / notifications, unit conversion at consume time, multi-output recipes (one cook → meat + bones + stock), and substitution-aware consumption (draw `whole` for a `diced` line).
