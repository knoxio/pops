# What-Can-I-Cook Solver

Status: Done. Solver endpoint, shared substitution service, and the full `/food/solve` surface ship. Deep solver integration tests and a server-side performance guard are not yet written — see [solver-test-and-perf-coverage](../ideas/solver-test-and-perf-coverage.md). The tag filter ships as a typed comma-separated input pending a distinct-tags surface — see [solver-tag-taxonomy-filter](../ideas/solver-tag-taxonomy-filter.md).

`/food/solve` is the discovery surface: it walks every cookable recipe against the current fridge plus the substitution graph and returns the ranked subset the user can actually make right now. Binary cookable answer per recipe — true iff every required line is satisfied by FIFO inventory OR a valid single-hop substitution. Ranked by `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`. "Cook this" jumps to `/food/recipes/:slug` and the regular cook flow takes over. No new tables.

## REST API surface

Contract: `pillars/food/src/contract/rest-solver.ts`, mounted as `solver.canICook` in `rest.ts`.

`POST /solver/can-i-cook` — pure read; modelled as POST because the array-shaped filter set (`recipeTypes`, `tags`) rides more cleanly in a JSON body than repeated query params.

Body (all fields optional):

| Field         | Type                                 | Effect                                                               |
| ------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `excludeSubs` | boolean                              | Keep only recipes with `subsNeeded === 0`.                           |
| `recipeTypes` | `RecipeType[]` (max 7)               | Restrict candidates by `recipes.recipe_type`.                        |
| `tags`        | `string[]` (max 32, each 1–64 chars) | AND across tags — recipe must carry every selected tag.              |
| `maxMinutes`  | int, 1…1440                          | Keep recipes where `prep + cook ≤ maxMinutes`, or both minutes null. |

`RecipeType` enum: `plate | component | technique | sauce | dressing | drink | condiment`.

Response `200 SolveResult`:

```
SolveResult {
  totalCandidates: number   // recipes considered after pre-filters (pre-excludeSubs)
  cookableCount: number     // === recipes.length
  recipes: SolveRecipeRow[] // cookable only, ranked
}

SolveRecipeRow {
  recipeId, recipeSlug, title
  recipeType: RecipeType | null
  heroImagePath: string | null
  prepMinutes, cookMinutes: int | null
  lastCookedAt: string | null   // ISO; MAX completed recipe_run across all versions
  subsNeeded: number            // count of LINES resolved by a sub (an edge resolving two lines counts twice)
  subs: SolveSubBreakdown[]
}

SolveSubBreakdown {
  lineIndex: number             // recipe_lines.position
  fromIngredientName: string
  fromVariantName: string | null
  candidateSubName: string      // e.g. "coconut-oil (refined)"
  substitutionId: number        // substitutions.id
}
```

## Solver pipeline

`pillars/food/src/api/modules/solver/` — `canICook` orchestrator + `candidates`, `lines`, `line-evaluator`, `name-lookup`, `inputs`, `types`.

1. **Pre-filter** (`candidates.ts`, SQL): eligible = non-archived recipe with `current_version_id` pointing at a `compiled` version. Apply `recipeTypes` (IN) and `maxMinutes` in SQL; apply `tags` as a `GROUP BY recipe_id HAVING COUNT(DISTINCT tag) = :selectedCount` AND-filter. `lastCookedAt` is loaded as `MAX(recipe_runs.completed_at)` across every version (left join — never-cooked → null).
2. **Bulk load** for the candidate set: required lines (optional lines stripped here), pantry inventory keyed by `(variantId, prepStateId)`, the substitution index (global + recipe-scoped edges), recipe-tag lists, and ingredient/variant name dictionaries — one load each, not N per recipe.
3. **Per-line walk** (`line-evaluator.ts`): for each non-optional line, FIFO first — sum `batches` matched on `(variantId, prepStateId, qty_remaining > 0, deleted_at IS NULL)`; if `≥ line qty` the line is covered. Else walk substitution candidates (`resolveCandidatesForLine`); first edge whose `to`-side batch sum `× ratio ≥ needed` wins and is recorded. If neither FIFO nor any sub clears the threshold, short-circuit — recipe is uncookable and dropped. A line whose compiled canonical qty is `null` (unresolved conversion) fails closed: the recipe is never declared cookable.
4. **Assemble**: `subsNeeded = count(covered-by-sub lines)`. Apply `excludeSubs` post-filter. Sort `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`. `totalCandidates` reflects the pre-`excludeSubs` pool; `cookableCount === recipes.length`.

### Shared substitution-resolution service

`pillars/food/src/api/modules/substitutions/substitutions-resolve.ts` is the canonical home for substitution resolution, consumed by BOTH the solver (per-line during `canICook`) and the cook-time picker. Layers: `loadSubstitutionsIndex(db, recipeIds?)` bulk load, `resolveCandidatesForLine(index, ctx)` pure filter, `loadBatchInventory(db)` pantry snapshot.

Resolution rules:

- A line matches an edge when the edge's `from` side equals the line's ingredient (applies to any variant) OR its variant (pins to that variant).
- `scope = 'recipe'` edges override `scope = 'global'` edges for the same `(from, to)` pair within that recipe; other global edges out of the same `from` survive.
- Context tags use OR-overlap: empty `context_tags` is a wildcard; otherwise the edge matches iff at least one of its tags overlaps the recipe's `recipe_tags`.
- Sub matching retains the line's prep state, falling back to the null-prep slot so a sub stocked in a different prep state still matches.

## Frontend

`/food/solve` → `pillars/food/app/src/pages/solve/`: `SolvePage`, `SolveFilters`, `SolveRecipeCard`, `SubBreakdownExpander`, `useSolveResult`.

- **Filters** (`SolveFilters`): "No substitutions" toggle, recipe-type chip multi-select, tags text input (comma-separated — see idea file), max-time dropdown (≤15/30/45/60 min / any).
- **Count caption**: `"<cookable> of <total> recipes cookable"`.
- **Card** (`SolveRecipeCard`): icon 📗 (clean) / ⚠ (subs needed), title linking to `/food/recipes/:slug`, status line (`N subs needed` or `No subs needed` · total time · relative last-cooked), inline `from → to` for one sub or a "Show subs" expander for 2+, and a "Cook this" button to the same route.
- **Empty states**: filtered → "Clear filters"; bare pantry → "Open fridge" link.
- **Polling** (`useSolveResult`): refetch every 60s via TanStack Query, `refetchIntervalInBackground: false` so a backgrounded tab pauses the timer.
- **Shell**: nav entry "Solve" (Compass icon) registered after Fridge in the food sub-nav (`routes.tsx` navConfig); `/food/fridge` header carries a "What can I cook?" link to `/food/solve`.

## Business rules

- Candidate set: non-archived, `current_version_id IS NOT NULL`, `compile_status = 'compiled'`. Drafts excluded.
- Only `optional = 0` lines are required; optional lines are stripped before any FIFO/sub lookup and never block cookability or appear in the breakdown.
- Substitution is single-hop only; no transitive chains.
- The first qualifying sub edge wins (no preference ordering between subs at solve time).
- `maxMinutes`: recipe passes iff `COALESCE(prep,0) + COALESCE(cook,0) ≤ maxMinutes`, OR both minutes are null (unknown duration always shown). One null is treated as 0.
- `tags` filter is AND; empty array applies no filter.
- The solver pre-commits nothing — clicking "Cook this" hands off to the cook flow, which may pick different subs. The solver answers "is this cookable", not "here is exactly how".
- No server-side caching; cheap to recompute per request.

## Edge cases

- Empty pantry → every recipe uncookable → bare-pantry empty state.
- FIFO across multiple batches sums (200g need, 100g + 150g batches → covered).
- A single sub edge resolving two lines is counted (and listed) twice; no dedup.
- Recipe with zero ingredient lines → `subsNeeded = 0`, cookable, surfaces in the clean band.
- A line with null canonical qty (unresolved conversion) → recipe never cookable.
- Filters narrowing to zero candidates → filtered empty state.

## Acceptance criteria

Routes & shell

- [x] `/food/solve` registered with a "Solve" sidebar entry, ordered after Fridge.
- [x] `/food/fridge` header has a "What can I cook?" link to `/food/solve`.

Page

- [x] Filters: no-subs toggle, recipe-type chips, tags input, max-time dropdown.
- [x] Count caption renders `<cookable> of <total> recipes cookable`.
- [x] Card renders icon (📗/⚠), title, status line, inline sub / expander, "Cook this".
- [x] "Cook this" navigates to `/food/recipes/:slug`.
- [x] Polling refetches every 60s while visible; pauses when the tab is backgrounded.

Solver

- [x] `POST /solver/can-i-cook` returns `SolveResult` and rejects an invalid `recipeType` at the zod boundary with 400.
- [x] Candidate set filters by archived + current_version + compile_status.
- [x] Each line: FIFO first, single-hop subs second; optional lines stripped before lookup.
- [x] `subs` reports the chosen sub per covered-by-sub line.
- [x] Result sorted `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`.
- [x] `excludeSubs` removes `subsNeeded > 0` rows; `totalCandidates` stays pre-`excludeSubs`, `cookableCount === recipes.length`.

Filter behaviour

- [x] No-subs toggle drops sub-requiring rows.
- [x] Recipe-type and max-time filters narrow candidates pre-cookability; null minutes always pass.
- [x] Tags filter is AND across selected tags.

Shared service

- [x] Substitution resolution lives in `substitutions/substitutions-resolve.ts` and is consumed by both the solver and the cook-time picker.

Tests

- [x] `SolvePage.test.tsx` covers render, count caption, multi-sub toggle, Cook-this navigation, `excludeSubs` threading, and both empty states.
- [x] `solver.test.ts` covers the empty-catalogue result, filter-set acceptance, and the invalid-`recipeType` 400.
