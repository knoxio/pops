# Recipe Graph Cycle Detection

Status: Done. Detector implemented and wired into the recipe compile pipeline. Deferred enhancements (multi-cycle reporting, reachability caching, UI cycle visualisation, break-suggestions) live in `../../ideas/recipe-cycle-detection-extensions.md`.

## Purpose

A recipe's `@ingredient(...)` line may reference either a raw ingredient or another recipe's yield ([ADR-022](../../architecture/adr-022-unified-recipe-ingredient-model.md)). That unification makes cycles possible: A uses B's yield, B uses C's, C uses A's. The recipe graph must stay acyclic. This detector is the last gate before materialisation in the compile pipeline: it runs in memory against the candidate's resolved AST plus the live recipe-lines graph, so a cycle is rejected before any rows are written.

## Detector API

`pillars/food/src/dsl/cycle.ts`:

```ts
export function detectRecipeCycle(resolved: ResolvedRecipeAst, ctx: CycleContext): CycleResult;
```

Types live in `cycle-types.ts`. It imports `FoodDb` for `CycleContext.db`, but only as a `import type` (the sole DB reference is type-only, so no runtime DB code is pulled in), which lets the DSL barrel re-export the types cleanly:

- `CycleContext = { db: FoodDb /* read-only */; currentRecipeId: number | null }` — `null` for a brand-new recipe never inserted; otherwise the id being compiled.
- `CycleResult = { ok: true } | { ok: false; cycle: CycleDescription }`.
- `CycleDescription = { path: number[]; pathSlugs: string[]; offendingBlockLoc: SourceSpan }`. `path` is recipe ids in walk order, starting and ending with `currentRecipeId`; `pathSlugs` is the same path as slugs for editor messages; `offendingBlockLoc` is the candidate `@ingredient` block that introduced the cycle.
- `CycleError = { code: 'RecipeCycle'; message; loc }` — the compile pipeline wraps a cycle as this for surfacing.

## Algorithm

Inputs: `currentRecipeId`; the candidate's outgoing edges (resolved blocks where `kind='ingredient' && isRecipeRef && recipeRef !== null`, each carrying its source span); and the outgoing edges of every other recipe, read from `recipe_lines` joined to `recipes.current_version_id`.

Iterative DFS from each candidate target T, explicit stack + parent map (no recursion, no overflow on pathological graphs). If the walk reaches `currentRecipeId`, reconstruct the path via the parent map and return the cycle. Each visited node's outgoing edges come from one prepared SELECT; `pathSlugs` is one batched `SELECT id, slug FROM recipes WHERE id IN (...)` regardless of cycle length.

Outgoing-edge query (live graph only):

```sql
SELECT rl.recipe_ref_id
  FROM recipe_lines rl
  JOIN recipes r ON rl.recipe_version_id = r.current_version_id
 WHERE r.id = ?1 AND rl.is_recipe_ref = 1 AND rl.recipe_ref_id IS NOT NULL
```

## Business Rules

- Read-only against the DB; the detector never writes and never mutates its inputs (`resolved`, `ctx.db`).
- Only the live graph counts: edges come from each recipe's `current_version_id`. Draft and archived versions are excluded — a draft that would cycle on promotion is caught when that draft is itself compiled.
- Runs after resolve and before materialise. Not run during pure parse (it needs resolved recipe ids).
- First-found semantics: if the candidate has multiple independently-cycling edges, the first one walked is reported.
- Single-current-version (one promoted version per recipe) bounds the mutual-deadlock race: of two recipes that reference each other, whichever compiles first succeeds; the second detects the cycle and fails.

## Compile-pipeline wiring

- `compile.ts` `compileResolved` calls `detectRecipeCycle` between resolve and materialise.
- On a cycle, `compile-finalise.ts` `failCycle` writes `recipe_versions.compile_status='failed'` and a `compile_error` JSON carrying `phase:'cycle'`, the `RecipeCycle` message `Cycle detected: a -> b -> a`, and `extra:{ path, pathSlugs }`; it clears any partial `recipe_lines` / `recipe_steps` for the version. `CompilePhase` includes `'cycle'`.

## Edge cases

| Case                                             | Behaviour                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `currentRecipeId` null (new recipe)              | Return `ok: true` immediately; candidate has no incoming edges yet.                           |
| Candidate has no recipe-ref ingredients          | Return `ok: true`; nothing to walk.                                                           |
| Candidate → B → C, C terminal                    | Walk terminates, `ok: true`.                                                                  |
| Candidate → B → C → candidate                    | Cycle `[candidate, B, C, candidate]`; `offendingBlockLoc` is candidate's `@ingredient` for B. |
| Candidate → B and → C; B fine, C → candidate     | First-found: the C-path cycle is reported.                                                    |
| Self-reference (resolver normally rejects first) | Defensive: cycle `[candidate, candidate]`.                                                    |
| B is draft (`recipes.current_version_id` null)   | Excluded from the live graph; its refs are not followed.                                      |
| B archived                                       | `current_version_id` is null post-archive; ignored.                                           |

## Acceptance criteria

- [x] `detectRecipeCycle(resolved, ctx): CycleResult` exported from `pillars/food/src/dsl/cycle.ts`; types in `cycle-types.ts`, whose only DB reference is a type-only `import type { FoodDb }` (no runtime DB import).
- [x] Iterative DFS with explicit stack + parent map; no recursion.
- [x] Outgoing edges read via one Drizzle `sql` SELECT joining `recipe_lines` to `recipes.current_version_id`, filtering `is_recipe_ref = 1 AND recipe_ref_id IS NOT NULL`.
- [x] `pathSlugs` resolved via one batched `SELECT id, slug FROM recipes WHERE id IN (...)`.
- [x] `currentRecipeId` null returns `ok: true` without walking; candidate with no recipe-refs returns `ok: true`.
- [x] 3-cycle, 2-cycle, and defensive self-loop all report a cycle with a correctly reconstructed path; `offendingBlockLoc.startLine` matches the offending block.
- [x] First-found: two recipe-refs (one cycles, one safe) reports the cycling one.
- [x] `pathSlugs` are human-readable slugs in walk order, starting and ending with `candidate`.
- [x] Draft / unpromoted recipes are excluded from the live graph (a draft with a cycling `recipe_line` does not trigger detection).
- [x] Wired into `compile.ts` between resolve and materialise; on cycle, `failCycle` sets `compile_status='failed'` and writes the path + slugs to `compile_error` JSON (`phase:'cycle'`).
- [x] Vitest suite `pillars/food/src/dsl/__tests__/cycle.test.ts` covers all of the above.
