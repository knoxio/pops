# Cook Event Recording

Status: Partial — the cook modal, both REST endpoints, and the recipe-detail "Cook now" entry point ship. The plan-entry deep-link does not auto-open the modal or pass `planEntryId`, and the modal does not feed live server shortfalls into the resolution UI (see `docs/ideas/cook-event-recording-extensions.md`).

The "Mark cooked" / "Cook now" flow: a single modal that records one cook as one transaction — a `recipe_run`, its `batch_consumptions` (FIFO over `batches`), an optional yielded `batch`, and a `plan_entries.recipe_run_id` link when the cook came from a plan entry. The modal mounts as an overlay on the recipe-detail page; it has no route of its own (cook is high-friction-if-interrupted, so we keep it out of URL state to discourage accidental browser-back).

## Entry points

- **Recipe-detail "Cook now"** — `RecipeDetailPage`'s action menu injects a "Cook now..." item into `extraItems` between Drafts and "Send to shopping list..." (canonical menu order: Edit / Drafts / Cook now... / Send to shopping list... / Archive). Disabled unless `compile_status='compiled'`. Pre-fills `recipeVersionId` (displayed version) and `scaleFactor` (from `RecipeScaleProvider`). `CookNowPortal` mounts the modal and owns the success toast.
- **Plan-entry "Mark cooked"** — the plan-entry edit sheet links to `/food/recipes/:slug?cook=<planEntryId>`. The cook contract and `CookModal` already accept `planEntryId`; auto-opening from this deep-link and propagating the id is deferred (idea file).

The modal accepts an optional `planEntryId`. When set, `markCooked` links the new `recipe_run` to that plan entry. When absent, the cook is ad-hoc.

## Modal fields

- **Scale factor** — number input, default from `prepareCook.defaultScaleFactor` (plan's `planned_servings / recipe_versions.servings`, else 1.0). Clamp > 0. Drives the consume-preview.
- **Yield qty / unit** — pre-filled from `recipe_versions.yield_qty × scale`, editable. Hidden when the recipe yields no batch.
- **Yielded variant** (read-only) — resolved server-side from `yield_variant_id` to a name + prep-state label.
- **Location** — radio over `pantry | fridge | freezer | other`; default `fridge`. Hidden for yieldless recipes.
- **Expires** — date input, auto-fills from `produced_at + default_shelf_life_days_<location>`; user can override; null allowed (shelf-stable).
- **Rating** — optional 1–5 integer.
- **Notes** — optional, 1000-char cap.
- **Consume preview / shortfalls** — embedded panels (`ConsumePreviewPanel`, `ShortfallList`) list the batches FIFO will draw and any unmet needs; resolution is per-line (`fifo | batch-override | external | partial`). Built and present; the modal currently seeds them with an empty shortfall list (live-shortfall feed deferred — idea file).
- **Buttons** — Cancel closes; Mark cooked submits `markCooked`. Mark cooked is disabled while the form is invalid or any shortfall is unresolved. On success the modal closes and a toast fires with a "View batch" action linking to `/food/fridge?batch=<id>` (or a no-batch variant for yieldless cooks). On failure the modal stays open with an inline error.

A recipe yields a batch only when both `yield_ingredient_id` and `yield_variant_id` are set; otherwise the yield/location/expires fields are hidden and no `yielded_batch_id` is recorded.

## REST API

Mounted under the food contract as the `cook` sub-router. Both are POST-with-body (typed numbers + a discriminated `consumptionOverrides[]` union that does not round-trip through query strings).

- `POST /cook/prepare` — pre-flight for the modal. Body `{ recipeVersionId, scaleFactor, planEntryId? }`. Returns `CookPreparation` (200) or `{ message }` (404) when the recipe version or supplied plan entry is missing.

  ```
  CookPreparation {
    recipeTitle, recipeSlug, versionNo,
    defaultScaleFactor,
    yieldsBatch: boolean,
    yieldDefault: { qty, unit, variantName, prepStateLabel,
                    shelfLifeFridgeDays, shelfLifeFreezerDays } | null,
    consumeNeeds: LineConsumeNeed[],   // canonical at scale=1; client multiplies
    alreadyCooked: boolean,            // planEntryId already has a recipe_run_id
  }
  ```

- `POST /cook/mark-cooked` — record one cook. Body `{ recipeVersionId, scaleFactor, planEntryId?, yield?, rating?, notes?, consumptionOverrides? }`. Always 200; result is a discriminated domain outcome (failures are `{ ok: false, reason }`, not HTTP errors):

  ```
  { ok: true,  recipeRunId, yieldedBatchId: number | null }
  | { ok: false, reason: MarkCookedError, shortfalls?: Shortfall[] }
  ```

`yield` carries `{ qty, unit, location, expiresAt?, notes? }`. A `consumptionOverride` is one of `batch-override` (draw `consumeQty` from `batchId`), `external` (need met outside the batch system), or `partial` (split batch + external); `batch-override`/`partial` may carry a `substitutionEdgeId`.

```
MarkCookedError =
  RecipeVersionNotFound | RecipeNotCompiled | PlanEntryNotFound
  | PlanEntryAlreadyCooked | YieldRequired | YieldForbidden
  | BadScaleFactor | BadYieldQty | BadRating | BadExpiry
  | ShortfallUnresolved | SubstitutionEdgeInvalid
```

### `markCooked` transaction

One transaction; any failure rolls everything back (no orphan runs, no half-consumed batches, no zombie plan entries):

1. Preflight (before the tx opens, so every error code is reachable): validate ranges (`scaleFactor > 0`, `yield.qty ≥ 0`, `rating ∈ 1..5`, `expiresAt` not in the past); load the version (404 → `RecipeVersionNotFound`); require `compile_status='compiled'` (`RecipeNotCompiled`); check yield-shape consistency (`YieldRequired` / `YieldForbidden`); validate the plan entry (`PlanEntryNotFound` / `PlanEntryAlreadyCooked`).
2. INSERT `recipe_runs` with `recipe_version_id`, `scale_factor`, `started_at = now`.
3. Apply `consumptionOverrides` (writes the chosen batch/external/partial draws and, for substitution edges, validates the edge and appends an audit line to `recipe_runs.notes`; an invalid edge → `SubstitutionEdgeInvalid`).
4. Compute remaining (non-overridden, non-optional) needs from `recipe_lines × scale`; run FIFO `consumeForRun`. Unmet → roll back with `ShortfallUnresolved` + `shortfalls[]`.
5. `createBatchFromRun` (single owner of the create-batch-during-cook contract) sets `completed_at` and, for yielding recipes, INSERTs the batch with `yielded_batch_id`; `expires_at` falls back to the shelf-life formula when `yield.expiresAt` is omitted. Runs once per cook, yielding or yieldless.
6. Finalise `recipe_runs` rating + notes (user notes + override audit lines, capped at 1000 chars).
7. If `planEntryId`: conditional `UPDATE plan_entries SET recipe_run_id WHERE id=? AND recipe_run_id IS NULL`. Zero rows affected → roll back with `PlanEntryAlreadyCooked` (race-safe against a parallel cook).

## Business rules

- One `markCooked` = one cook event. No partial cooks, no incremental commits.
- A recipe must be `compiled` to cook (`RecipeNotCompiled` otherwise).
- A plan entry's `recipe_run_id` goes NULL → non-null exactly once; later cooks against it must be ad-hoc.
- `started_at` and `completed_at` both record the click moment; the modal does not track time-on-modal as cook duration.
- `recipe_runs.scale_factor` is the submitted scale (may differ from the plan's servings).
- Rating and notes are optional; a completed run is immutable in v1.
- The cook never deletes plan entries; they persist with `recipe_run_id` set.
- Empty `consumptionOverrides[]` is the happy path.
- `yield.expiresAt` defaults to `produced_at + default_shelf_life_days_<location>`; NULL when both location shelf-life columns are NULL.

## Edge cases

- Plan entry deleted in another tab → `PlanEntryNotFound`; modal stays open, user can submit ad-hoc.
- Plan entry cooked in another tab → `PlanEntryAlreadyCooked`.
- Archived recipe version still cooks (no status gate beyond `compiled`).
- `yield_qty=0` is accepted: a yielded batch with `qty_remaining=0` is created.
- Empty `recipe_lines`: `consumeForRun` is a no-op; a yielded batch is still created if applicable.
- `expiresAt` strictly before now is rejected (`BadExpiry`); the boundary check uses the request instant as a proxy for `produced_at`.
- A recipe whose `yield_ingredient_id` is set but `yield_variant_id` is null is treated as yieldless (it can't produce a batch).

## Acceptance criteria

### Contract + transaction

- [x] `POST /cook/prepare` returns `CookPreparation` matching the schema; 404 `{ message }` for a missing recipe version or plan entry; `defaultScaleFactor` uses the plan's servings ratio when `planEntryId` is given.
- [x] `POST /cook/mark-cooked` runs as a single transaction: `recipe_run` + `batch_consumptions` (FIFO) + optional yielded `batch` + plan-entry link, all committed or all rolled back.
- [x] `createBatchFromRun` is invoked once per cook (yielding sets `yielded_batch_id`; yieldless sets only `completed_at`, `yieldedBatchId === null`).
- [x] Yield's `expiresAt` defaults to the shelf-life formula when omitted; honoured when supplied.
- [x] Every `MarkCookedError` is reachable on its condition (range errors, `RecipeNotCompiled`, `Yield{Required,Forbidden}`, `PlanEntry{NotFound,AlreadyCooked}`, `ShortfallUnresolved`, `SubstitutionEdgeInvalid`).
- [x] `ShortfallUnresolved` rolls back the `recipe_run` and returns the `shortfalls[]` array.
- [x] Plan-entry link is a race-safe conditional UPDATE; a parallel cook loses with `PlanEntryAlreadyCooked`.
- [x] `consumptionOverrides` apply `batch-override` / `external` / `partial`; substitution edges validate and append an audit line to `recipe_runs.notes`.

### Modal

- [x] Renders fields seeded from `prepareCook` (scale, yield qty, location, expires, rating, notes).
- [x] Yield + location + expires hidden when `yieldsBatch=false`.
- [x] "Cook now..." appears in the recipe-detail action menu in canonical order; disabled unless `compiled`.
- [x] Mark cooked disabled while the form is invalid or shortfalls are unresolved.
- [x] Successful submit closes the modal and toasts with a "View batch" link to `/food/fridge?batch=<id>` (no-batch variant for yieldless).
- [x] Failed submit keeps the modal open with the server error surfaced inline.
- [ ] Plan-entry "Mark cooked" deep-link auto-opens the modal and passes `planEntryId` — deferred (`docs/ideas/cook-event-recording-extensions.md`).
- [ ] Live server shortfalls feed the resolution panels — deferred (idea file).

### Tests

- [x] REST integration (`src/api/__tests__/cook.test.ts`): prepare happy path + 404s; markCooked happy path / yieldless / scaling; every error branch; plan-entry link + race; consumption-override matrix (`batch-override` / `external` / `partial`); substitution-edge validation + audit line.
- [x] Modal RTL (`app/src/components/cook/__tests__/CookModal.test.tsx`): renders from prepare data, hides yield for yieldless, submits with form values, surfaces error codes, gates on empty scale.

## Out of scope

- Consume-preview / shortfall override internals — owned by the lists/FIFO consumption work (panels embedded here).
- Standalone batch creation outside a cook — batch lifecycle services.
- `/food/recipes/:slug/runs/:id` run-detail page; editing a completed run; multi-cook batch; full-screen cooking mode; voice / photo capture.
