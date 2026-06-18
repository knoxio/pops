# PRD-144: Cook Event Recording

> Epic: [05 — Meal Planning & Batches](../../epics/05-meal-planning.md)

## Overview

The "Mark cooked" / "Cook now" flow. A single modal opened from two entry points: (a) PRD-143's plan-entry edit sheet ("Mark cooked" button) and (b) PRD-119's recipe-detail action menu ("Cook now"). The modal captures actual scale factor, yielded qty, batch location, rating, and notes; the consume-preview and shortfall-override panels are owned by PRD-146; the yielded-batch creation services are owned by PRD-145. PRD-144 is the modal shell + the transactional `food.cook.markCooked` mutation that orchestrates them all.

After this PRD, the user clicks Mark cooked → fills the modal in 10-30 seconds → the cook is recorded as one transaction (recipe_run + batch_consumptions via PRD-108's FIFO helper + yielded batch via PRD-145's `createBatchFromRun` wrapper around PRD-108's `markRunComplete` + plan_entries.recipe_run_id linkage when applicable).

This is the central UI of Epic 05.

## Entry points

| Trigger                                                                   | Source PRD | Pre-fill                                                                                                                       |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| "Mark cooked" button in plan-entry edit sheet                             | PRD-143    | `planEntryId`, `recipeVersionId` (resolved via plan_entries), `plannedServings` → scale                                        |
| "Cook now" entry in RecipeDetailPage action menu (Epic 04 amendment kept) | PRD-119    | `recipeVersionId` (the version currently displayed), `scaleFactor` (from RecipeScaleProvider — PRD-119 amendment from PRD-142) |

The modal accepts an optional `planEntryId`. When set, the cook mutation links the new `recipe_run` to the plan entry via `plan_entries.recipe_run_id`. When null, the cook is ad-hoc.

## Route

The cook modal does not have its own route. It mounts as an overlay on whichever page triggered it (`/food/plan` or `/food/recipes/:slug`). Triggered via React state, NOT URL param — closing returns to the parent route as-is. This is intentional: cook flow is high-friction-if-interrupted, so we avoid URL-state to discourage accidental browser-back.

## Modal layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Mark cooked: "Chicken Tikka Masala"                          [×]   │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Scale factor:    [ 1.0 ] ×    (planned: 1.0)                       │
│                                                                     │
│  Yield qty:       [ 4 ] × [count ▼]    Yielded variant: ti-masala   │
│                                                                     │
│  Location:        ( ) pantry   (●) fridge   ( ) freezer  ( ) other  │
│  Expires:         [ 2026-06-12 ]   (auto: produced + 3d for fridge) │
│                                                                     │
│  Rating:          [ ☆ ☆ ☆ ☆ ☆ ]  (optional)                        │
│  Notes:           [                                          ]      │
│                                                                     │
│  ───────────────────────────────────────────────────────────────    │
│  ▾ Consume preview (PRD-146 panel — see below)                      │
│  ▸ Shortfalls (collapsed when none)                                 │
│  ───────────────────────────────────────────────────────────────    │
│                                                                     │
│                                  [Cancel]      [Mark cooked]        │
└────────────────────────────────────────────────────────────────────┘
```

### Fields (owned by this PRD)

- **Scale factor**: number input, default = plan entry's `planned_servings / recipe_versions.servings` when from a plan entry, else 1.0. Clamp ≥ 0.1. Changing this updates the consume-preview live.
- **Yield qty**: pre-filled from `recipe_versions.yield_qty × scale`. Editable. Disabled (hidden) when the recipe has `yield_ingredient_id IS NULL` (a plate that doesn't yield a batch — e.g. one-shot pasta).
- **Yielded variant** (read-only): from `recipe_versions.yield_variant_id`. Resolved server-side to a name + slug.
- **Location**: radio of the 4 PRD-108 enum values. Default = `fridge` if recipe yields something, else hidden.
- **Expires**: date input. Auto-fills from `produced_at + ingredient_variants.default_shelf_life_days_<location>` (per PRD-108) when the location changes; user can override. Null allowed (shelf-stable).
- **Rating**: 5-star widget, optional. Stores 1-5 INTEGER per PRD-108's `recipe_runs.rating` column.
- **Notes**: textarea, optional, 1000-char cap.

### Embedded panels (owned by other PRDs)

- **Consume preview**: PRD-146. Shows the batches FIFO will consume based on the current scale. Expandable; collapsed by default in the happy path (no shortfalls).
- **Shortfalls**: PRD-146. Listed inline if any consume needs can't be met. The Mark-cooked button is disabled until every shortfall is resolved per PRD-146's rules.

### Buttons

- **Cancel**: confirms if any field is dirty ("Discard cook attempt? This won't be recorded."). Closes modal.
- **Mark cooked**: primary CTA. Disabled when shortfalls unresolved (PRD-146). Submits `food.cook.markCooked`. On success: closes modal, toast "Cooked. Yielded batch added to fridge." (with a "View batch" link to `/food/fridge?batch=<id>`). On error: inline error display; modal stays open.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.cook.markCooked: mutation({
  input: {
    recipeVersionId: number,
    scaleFactor: number,                       // > 0
    planEntryId?: number,                      // null = ad-hoc cook
    yield?: {
      qty: number,                              // ≥ 0; required when recipe has yield_ingredient_id; ignored otherwise
      unit: 'g' | 'ml' | 'count',
      location: 'pantry' | 'fridge' | 'freezer' | 'other',
      expiresAt?: string,                       // ISO date; null = shelf-stable
      notes?: string,                           // batch-level notes (passed through to batches.notes)
    },
    rating?: number,                            // 1-5
    notes?: string,                             // recipe_run-level notes
    consumptionOverrides?: ConsumptionOverride[],   // PRD-146 — empty array in happy path
  },
  output:
    | { ok: true, recipeRunId: number, yieldedBatchId: number | null }
    | { ok: false, reason: MarkCookedError, shortfalls?: Shortfall[] },
});

food.cook.prepareCook: query({
  input: { recipeVersionId: number, scaleFactor: number, planEntryId?: number },
  output: CookPreparation,
});

export type CookPreparation = {
  recipeTitle: string;
  recipeSlug: string;
  versionNo: number;
  defaultScaleFactor: number;                   // 1.0 ad-hoc; or plan's servings/recipe.servings ratio
  yieldsBatch: boolean;                         // recipe_versions.yield_ingredient_id IS NOT NULL
  yieldDefault: {
    qty: number;                                 // recipe_versions.yield_qty × scaleFactor
    unit: 'g' | 'ml' | 'count';
    variantName: string | null;
    prepStateLabel: string | null;
    shelfLifeFridgeDays: number | null;
    shelfLifeFreezerDays: number | null;
  } | null;
  consumeNeeds: ConsumptionNeed[];               // input for PRD-146's preview; matches PRD-108's shape
  alreadyCooked: boolean;                        // true if planEntryId's recipe_run_id is already set
};

export type MarkCookedError =
  | 'RecipeVersionNotFound'
  | 'RecipeNotCompiled'                          // compile_status != 'compiled'
  | 'PlanEntryNotFound'
  | 'PlanEntryAlreadyCooked'                     // planEntryId's recipe_run_id is non-null
  | 'YieldRequired'                              // yield omitted but recipe yields a batch
  | 'YieldForbidden'                              // yield supplied but recipe doesn't yield
  | 'BadScaleFactor'                              // ≤ 0
  | 'BadYieldQty'                                 // < 0
  | 'BadRating'                                   // not in [1, 5]
  | 'BadExpiry'                                   // yield.expiresAt earlier than produced_at
  | 'ShortfallUnresolved';                        // PRD-146's overrides don't cover every shortfall — shortfalls[] returned alongside
```

### `markCooked` server-side flow

Open Drizzle transaction:

1. SELECT `recipe_versions` + `recipes`; validate `compile_status='compiled'` (else `RecipeNotCompiled`).
2. If `planEntryId` provided: SELECT plan entry; validate `recipe_run_id IS NULL` (else `PlanEntryAlreadyCooked`); validate it FKs to the same recipe (else `PlanEntryNotFound`).
3. Validate scale + yield consistency (per error codes).
4. INSERT `recipe_runs` with `recipe_version_id`, `scale_factor`, `started_at = datetime('now')`, `completed_at = NULL` (set in step 7), `rating`, `notes`.
5. Compute consume needs from `recipe_lines` × scale; merge with `consumptionOverrides` (PRD-146 controls which batches override which lines, or marks lines as "consumed externally").
6. Call PRD-108's `consumeForRun(runId, needs, db)` with the resolved needs. If shortfalls remain (i.e. a need has no override and FIFO can't cover it), ROLLBACK and return `ShortfallUnresolved` with the shortfalls list.
7. Call PRD-145's `createBatchFromRun(runId, yieldArgs, db)` (which wraps PRD-108's `markRunComplete` — PRD-145 is the single owner of the create-batch-during-cook contract). For yielding recipes, this INSERTs the batch + sets `recipe_runs.completed_at` + `recipe_runs.yielded_batch_id`; the `expires_at` falls back to `produced_at + default_shelf_life_days_<location>` if `yield.expiresAt` is omitted. **For yieldless recipes, the same call still runs** — PRD-145's wrapper / PRD-108's `markRunComplete` internal branch handles `yield`-absent by skipping the batch INSERT and just setting `completed_at`. PRD-144's transaction therefore always invokes `createBatchFromRun` once, regardless of yield, keeping the cook-finalisation contract single-owner.
8. If `planEntryId`: UPDATE `plan_entries SET recipe_run_id = <newRunId>`.
9. Commit. Return `{ ok: true, recipeRunId, yieldedBatchId }`.

The whole flow is one Drizzle transaction. Any failure rolls everything back — no orphan recipe_runs, no half-consumed batches, no zombie plan entries.

### `prepareCook` server-side flow

1. SELECT recipe_version + recipes (else error).
2. Compute `defaultScaleFactor`:
   - `planEntryId` provided → `plan_entries.planned_servings / recipe_versions.servings` (fall back to 1.0 if either is null/zero).
   - Otherwise → 1.0.
3. If `yield_ingredient_id IS NOT NULL`: compute `yieldDefault` from recipe*versions.yield*\* + ingredient_variants + prep_states + shelf-life defaults.
4. Compute `consumeNeeds` from `recipe_lines` × `scaleFactor`. Each need carries variant_id + prep_state_id + qty in canonical unit.
5. If `planEntryId`: SELECT plan_entries.recipe_run_id; populate `alreadyCooked`.
6. Return the full `CookPreparation`.

This query is called once when the modal opens; the consume-preview panel re-runs the scaling client-side as the user adjusts `scaleFactor` (since `consumeNeeds` is the canonical at-scale=1; UI multiplies). When `scaleFactor` settles, a debounced re-query keeps the server source-of-truth in sync if needed.

## Business Rules

- One `food.cook.markCooked` mutation = one cook event. No partial cooks; no incremental commits.
- A recipe with `yield_ingredient_id IS NULL` cooks without producing a batch: no `yielded_batch_id` on the run row; modal hides the yield + location + expires fields.
- Recipe must have `compile_status='compiled'` to cook. PRD-108 already documents this rule at the schema layer (`CannotCookUncompiledRecipe`); PRD-144 surfaces it as `RecipeNotCompiled` from the modal.
- A plan entry can transition `recipe_run_id` from NULL → non-null exactly once. Subsequent cooks against the same plan entry are ad-hoc (no `planEntryId` passed).
- `started_at` is `datetime('now')` at INSERT; `completed_at` is set in the same transaction by PRD-145's `createBatchFromRun` (which invokes PRD-108's `markRunComplete`; the latter sets `completed_at` for both yielding and yieldless recipes per PRD-145's amendment notes). Both timestamps record the moment the user clicked "Mark cooked" — the modal does NOT track time-on-modal as cook duration.
- `recipe_runs.scale_factor` is the `scaleFactor` the user actually submitted (may differ from the plan's planned servings).
- Rating is OPTIONAL. Notes is OPTIONAL. Both can be edited later from `/food/recipes/:slug/runs/:id` (deferred — out of scope for this PRD; PRD-145 may surface batch-edit which is adjacent).
- The cook mutation NEVER deletes plan entries. They persist post-cook with `recipe_run_id` set.
- An empty `consumptionOverrides[]` is the happy path. PRD-146's UI populates overrides only when shortfalls exist OR the user opts into override mode.
- The yield's `expiresAt` falls back to the PRD-108 default shelf life formula. If both location-specific shelf-life columns are NULL on the variant, expiresAt is NULL (shelf-stable). UI lets the user override regardless.

## Edge Cases

| Case                                                                                                | Behaviour                                                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| User opens modal from plan entry, then in another tab the plan entry is deleted                     | `markCooked` returns `PlanEntryNotFound`. Modal stays open with inline error; user can clear `planEntryId` and submit as ad-hoc.                     |
| User opens modal from plan entry, then in another tab the plan entry is cooked                      | `markCooked` returns `PlanEntryAlreadyCooked`. Inline error suggests refreshing.                                                                     |
| Recipe version was archived between modal open and submit                                           | The cook still proceeds — archived versions remain cookable (PRD-108 doesn't gate on status). UI may show a "(archived version)" badge.              |
| Scale = 0                                                                                           | Modal disables Mark cooked; server returns `BadScaleFactor` defensively.                                                                             |
| Yield qty negative                                                                                  | Modal validates client-side; server returns `BadYieldQty` defensively.                                                                               |
| Recipe yields a batch but `yield_qty=0` AND scale=2 → yield qty 0                                   | Allowed; batches CHECK requires `qty_remaining >= 0`. Yielded batch row is created with qty 0 (immediately empty). Edge of the schema, but accepted. |
| Recipe consumes 50 ingredients; FIFO finds all of them; modal submit                                | Single transaction; 50 batch_consumptions rows + 1 yielded batch + 1 recipe_run + plan_entry update. SQLite handles this in <100ms.                  |
| User closes the modal mid-submit (clicks ×)                                                         | Browser keeps the mutation in flight; rollback on success refuses, but Cancel is debounced during Submit. Toast: "Submission in progress…"           |
| User submits then offline                                                                           | tRPC error surfaces inline; transaction never reached the server.                                                                                    |
| `expiresAt` < `producedAt`                                                                          | Allowed (already-expired batches happen). UI warns with a small yellow note but doesn't block.                                                       |
| User submits with rating=6                                                                          | Client clamps to 1-5; server-side CHECK rejects 6 with `BadRating` (not in the enum above; add to MarkCookedError if needed).                        |
| User cooks a recipe whose `recipe_lines` is empty (compiled but zero lines)                         | `consumeForRun` is a no-op (empty needs). markRunComplete still creates a yielded batch if applicable. Allowed.                                      |
| Plan entry's `recipe_version_id` is set AND points at a different version than what user is viewing | Plan entry's pin wins. Modal shows the plan entry's version (read-only). Ad-hoc cooks from recipe detail use the displayed version.                  |
| User restarts the cook mutation after a `ShortfallUnresolved` by adding overrides                   | Same idempotency: a fresh recipe_run is INSERTed; the previous (rolled-back) one left no trace. No duplicate runs.                                   |
| User cooks a recipe that PRD-117's cycle detection would flag (cycles)                              | Compile would have failed earlier; `compile_status != 'compiled'` → `RecipeNotCompiled`.                                                             |

## Acceptance Criteria

Inline per theme protocol.

### Modal shell

- [ ] Modal renders with all spec'd fields (scale, yield qty, location, expires, rating, notes).
- [ ] Opens from PRD-143's "Mark cooked" button with plan entry pre-fill.
- [ ] Opens from PRD-119's "Cook now" action menu (PRD-119 amendment) with recipe version + scale pre-fill.
- [ ] Yield + location + expires fields hidden when `yieldsBatch=false`.
- [ ] Expires auto-fills on location change per PRD-108's default shelf-life columns.
- [ ] Cancel confirms if dirty; closes cleanly.
- [ ] Mark cooked disabled when shortfalls unresolved (PRD-146 contract).

### tRPC

- [ ] `food.cook.prepareCook` returns `CookPreparation` matching the schema; one round-trip.
- [ ] `food.cook.markCooked` runs as a single Drizzle transaction wrapping PRD-108's `consumeForRun` + PRD-145's `createBatchFromRun`. The latter is invoked for every cook (yielding or yieldless); the wrapper handles the yield-absent branch internally per PRD-145's amendment notes on PRD-108.
- [ ] Returns each error code on its respective condition.
- [ ] On `ShortfallUnresolved`, the shortfalls array is populated for PRD-146 to render.
- [ ] Plan entry's `recipe_run_id` is set in the same transaction when `planEntryId` provided.

### Behaviour

- [ ] Scale factor change updates consume-preview live (PRD-146 panel re-renders).
- [ ] Location change updates the auto-fill expires field.
- [ ] Successful submit closes the modal, toasts with a link to `/food/fridge?batch=<id>` when a batch was yielded.
- [ ] Failed submit keeps the modal open with inline error display.

### PRD-119 amendment (carried forward)

- [ ] `RecipeDetailPage` action menu gains a "Cook now" entry. Final canonical menu order after PRD-119 + PRD-142 + PRD-144 amendments: **Edit / Drafts / Cook now... / Send to shopping list... / Archive** (Edit + Drafts + Archive are PRD-119; Send is PRD-142; Cook now is this PRD). When Cook now is clicked, opens this PRD's modal.

### Tests

- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/cook-router.test.ts`:
  - Happy path: cook a recipe with 3 ingredients; recipe_run + 3 batch_consumptions + 1 yielded batch + plan_entry.recipe_run_id all written in one transaction.
  - Yieldless recipe: no batch row; `yieldedBatchId === null`.
  - Plan entry race: simulate another tab cooking; second call returns `PlanEntryAlreadyCooked`.
  - Compile-failed recipe → `RecipeNotCompiled`.
  - ShortfallUnresolved rolls back; no recipe_run row left behind.
  - Yield's `expiresAt` defaults to PRD-108 shelf-life when not supplied; honours user override when supplied.
- [ ] Vitest + RTL at `packages/app-food/src/components/cook/__tests__/CookModal.test.tsx`:
  - Renders pre-filled from plan entry.
  - Renders pre-filled from recipe detail.
  - Mark-cooked disabled until shortfalls resolved (PRD-146 mocked).
  - Submit → toast on success.

## Out of Scope

- Consume preview + shortfall override UX — **PRD-146**.
- Batch creation service internals — **PRD-145** (this PRD calls PRD-145's `createBatchFromRun`, which wraps PRD-108's `markRunComplete` and is the single owner of the create-batch-during-cook contract).
- Manual / standalone batch creation outside a cook event — **PRD-145**.
- `/food/recipes/:slug/runs/:id` cook detail page — deferred (out of scope for this epic; the success toast links to /food/fridge instead).
- Editing a completed recipe_run (rating / notes after the fact) — out of scope; the row is immutable in v1.
- Multi-cook batch (cook 3 recipes back-to-back, one modal) — out of scope.
- Cooking-mode full-screen view — out of scope (theme-level decision).
- Voice input — out of scope.
- Photo capture for the cook event — out of scope.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions` schema; `compile_status` gate.
- **PRD-108** — `recipe_runs` / `batches` / `batch_consumptions` schema; `consumeForRun` and `markRunComplete` services (called transactionally from this PRD's mutation).
- **PRD-111** — `plan_entries.recipe_run_id` FK; the cook mutation updates this when `planEntryId` is provided.
- **PRD-118** — `app-food` shell; the cook modal mounts inside this package.
- **PRD-119** — Amendment: `RecipeDetailPage` action menu gains "Cook now" entry between Drafts and "Send to shopping list..." (the existing PRD-142 amendment continues unchanged). Also: `useRecipeScale()` hook (PRD-142's prior amendment) is the source for the default scale factor when cooking ad-hoc.
- **PRD-121** — `RecipeRenderer` is not embedded in the modal (out of scope), but the page where Cook now lives uses it.
- **PRD-143** — "Mark cooked" button in plan-entry edit sheet is the primary entry point.
- **PRD-145** — Specialises the batch creation step (this PRD invokes PRD-108's `markRunComplete`; PRD-145 may wrap that call with extra UI-facing services like "create with default expiry override").
- **PRD-146** — Owns the consume-preview + shortfall-override panels embedded in the modal.

## Subsequent amendments

Pointers — not a spec change.

- **PRD-145** adds `BadExpiry` and `BadAdjustment` to the **batch** error enum (not `MarkCookedError`). `createBatchFromRun` is the canonical wrapper around `markRunComplete`; PRD-144 invokes it once per cook for both yielding and yieldless recipes.
- **PRD-149** (Cook-time substitutions): adds `SubstitutionEdgeInvalid` to `MarkCookedError`. Server-side override-resolution gains a substitution-detection branch that writes audit lines to `recipe_runs.notes`.
- **Canonical final `MarkCookedError`**: `RecipeVersionNotFound | RecipeNotCompiled | PlanEntryNotFound | PlanEntryAlreadyCooked | YieldRequired | YieldForbidden | BadScaleFactor | BadYieldQty | BadRating | BadExpiry | ShortfallUnresolved | SubstitutionEdgeInvalid`.
