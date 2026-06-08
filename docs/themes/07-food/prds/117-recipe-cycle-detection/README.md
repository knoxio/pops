# PRD-117: Recipe Graph Cycle Detection

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

[ADR-022](../../../../architecture/adr-022-unified-recipe-ingredient-model.md) unifies ingredients and recipe outputs into one graph: a recipe's `@ingredient(N, slug, ...)` line may reference either a raw ingredient or another recipe's yield. That construction makes cycles possible: recipe A uses B's yield, B uses C's yield, C uses A's yield. The graph must be acyclic; this PRD defines the detector that enforces it.

Cycle detection is the **last gate before materialisation** in PRD-116's compile pipeline. It runs in memory using the candidate recipe's `ResolvedRecipeAst` (from PRD-115) plus the existing recipe-lines graph from the DB, so a cycle is rejected before any rows are written.

## Detector API

```ts
// packages/app-food/src/dsl/cycle.ts
export function detectRecipeCycle(resolved: ResolvedRecipeAst, ctx: CycleContext): CycleResult;

export type CycleContext = {
  db: SqliteDb; // read-only — current versions of other recipes
  currentRecipeId: number | null; // null for not-yet-saved new recipe; otherwise the id being compiled
};

export type CycleResult = { ok: true } | { ok: false; cycle: CycleDescription };

export type CycleDescription = {
  path: number[]; // recipe ids forming the cycle, in walk order
  pathSlugs: string[]; // the same path expressed as slugs for the error message
  offendingBlockLoc: SourceSpan; // the @ingredient block in the candidate that introduced the cycle
};

export type CycleError = {
  code: 'RecipeCycle';
  message: string; // "Cycle detected: smash-patty -> burger -> smash-patty"
  loc: SourceSpan; // = offendingBlockLoc
};
```

The detector returns a structured cycle description so PRD-116 can wrap it as a `CycleError` and PRD-115's editor surfaces (Epic 01) can highlight the offending `@ingredient` block.

## Algorithm

Given:

- `currentRecipeId` (may be null for a brand-new recipe not yet inserted)
- Outgoing edges of the candidate: the set of `recipe_ref_id` values across `resolved.blocks` where `kind='ingredient'` AND `isRecipeRef=true`. Each carries its source span (the `@ingredient` block).
- Outgoing edges of every OTHER recipe: from `recipe_lines` joined against `recipes.current_version_id`. Only `is_recipe_ref=1` rows count. Drafts and archived versions are ignored — they don't participate in the live graph until promoted.

Walk:

```
for each candidate-target T in candidateTargets:
    visited = empty set
    stack  = [T]
    while stack not empty:
        node = stack.pop()
        if node == currentRecipeId:
            return cycle found, with path reconstructed
        if node in visited:
            continue
        visited.add(node)
        for next in outgoingEdgesOf(node):  // from DB
            stack.push(next)
return ok
```

Edge cases:

- If `currentRecipeId` is null (brand-new recipe), no cycle is possible from the candidate's perspective: the candidate has no incoming edges yet. Return `ok: true` without walking.
- If a candidate-target T equals `currentRecipeId` directly (self-reference), PRD-115's resolver already rejected it with a self-reference error; the detector should never see this case in practice. Defensive check: if encountered, return cycle with single-element path.
- Pre-existing cycles in the DB (theoretically impossible because every prior compile passed this check): the walk will detect them as it traverses and return cycle. This is a safety net, not a normal path.

### Path reconstruction

The stack-based DFS above loses the path. To return a meaningful `CycleDescription.path`, the detector uses a parent map: each push records `(node, parent)`. When `node === currentRecipeId` is hit, walk parents back to T, prepend `currentRecipeId`, and that's the cycle in order.

### Slug lookup for `pathSlugs`

After reconstruction: single batched SELECT `slug FROM recipes WHERE id IN (path...)` and map back. One round-trip regardless of cycle length.

## Performance

- Bounded by the size of the live recipe graph (recipes with `current_version_id IS NOT NULL`).
- DFS visits each node at most once per candidate-target; total work is O(targets × reachable_nodes).
- For a personal recipe library (target ~500 recipes), worst-case walks are sub-millisecond.
- For larger libraries: if perf becomes a concern, precompute and cache a reachability index (recipe_id → set of reachable recipe_ids). Out of scope for v1; the detector is not the bottleneck.

## Business Rules

- Cycle detection is **read-only** against the DB. No writes.
- Cycle detection ignores draft and archived versions. A recipe with a pending draft that _would_ form a cycle on promotion will be caught when that draft is itself compiled — the candidate at that time is the draft, and the existing graph has had time to settle.
- Cycle detection runs AFTER resolve (PRD-115) and BEFORE materialise (PRD-116). It does not run during pure parse (PRD-114) because it needs resolved IDs.
- The detector never modifies its inputs (`resolved`, `ctx.db`).
- Even if the candidate has multiple outgoing edges that each independently form a cycle, the detector returns the FIRST one found. (Future enhancement: collect all cycles. v1 only reports one.)

## Edge Cases

| Case                                                                          | Behaviour                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `currentRecipeId` null (new recipe never inserted)                            | Return `ok: true` immediately; no walk needed.                                                                                                                                 |
| Candidate has no recipe-ref ingredients                                       | Return `ok: true`; nothing to walk.                                                                                                                                            |
| Candidate references recipe B; B has no recipe-refs                           | Walk visits B, terminates, returns `ok: true`.                                                                                                                                 |
| Candidate references B; B references C; C references candidate                | Cycle: `[candidate, B, C, candidate]`. `offendingBlockLoc` points to candidate's `@ingredient` for B.                                                                          |
| Candidate references B and C independently; B is fine; C references candidate | Cycle reported for the C path; B path is not investigated further (first-found).                                                                                               |
| Candidate self-references (caught earlier by PRD-115)                         | Should not occur; defensive: return cycle `[candidate, candidate]`.                                                                                                            |
| Recipe B in the DB has `current_version_id=null` (draft only)                 | B is not in the live graph; walk doesn't follow B's draft refs. Safe.                                                                                                          |
| Recipe B is archived (`recipes.archived_at IS NOT NULL`)                      | B's slug is still resolvable for historical reads, but its current_version_id should be null after archive. Detector ignores it.                                               |
| Two recipes deadlock — A and B both promoted, both reference each other       | First compile (whichever wins the race) succeeds; second compile detects the cycle and fails. The DB enforces single-current-version (PRD-107) so race conditions are bounded. |

## Acceptance Criteria

Inline per theme protocol.

### Implementation

- [ ] `packages/app-food/src/dsl/cycle.ts` exports `detectRecipeCycle(resolved, ctx): CycleResult` matching the API above.
- [ ] Implementation uses iterative DFS with explicit stack + parent map (no recursion — avoids stack overflow on pathological graphs).
- [ ] DB reads use a single prepared statement for `outgoingEdgesOf(node)`: `SELECT recipe_ref_id FROM recipe_lines rl JOIN recipes r ON rl.recipe_version_id = r.current_version_id WHERE r.id = ? AND rl.is_recipe_ref = 1`.
- [ ] Slug lookup for `pathSlugs` is one batched query, not N round-trips.

### Tests

- [ ] Vitest suite at `packages/app-food/src/dsl/__tests__/cycle.test.ts`.
- [ ] Happy path: candidate references B, B references C, C is terminal — `ok: true`.
- [ ] 3-cycle: A → B → C → A — detector reports cycle with correct path.
- [ ] 2-cycle: A → B → A — detector reports cycle.
- [ ] Self-loop (defensive): A → A directly — detector reports cycle with single-element path.
- [ ] Null currentRecipeId (new recipe): returns `ok: true` regardless of candidate edges.
- [ ] Recipe with no recipe-refs: returns `ok: true` immediately.
- [ ] Pre-existing graph cycle (seed the DB with one, despite it being impossible normally): detector still catches it on next compile.
- [ ] Multiple independent cycles from one candidate: detector returns the first found; test asserts at least one is reported.
- [ ] Path reconstruction: cycle path is in walk order, starts and ends with `currentRecipeId`.
- [ ] `offendingBlockLoc` matches the `@ingredient` block in the resolved AST that introduced the cycle.

### Cross-PRD wiring

- [ ] PRD-116's compile function calls `detectRecipeCycle` between resolve and materialise.
- [ ] On cycle: compile returns `{ ok: false, phase: 'cycle', errors: [cycleError] }`; `compile_status='failed'`; `compile_error` JSON includes the cycle path and slugs.

## Out of Scope

- Cycle detection across recipes in **draft** state — only the live (current-version) graph is walked.
- Visualising the cycle in the UI — Epic 01 PRD.
- Multi-cycle reporting — v1 returns the first found.
- Reachability caching for large libraries — deferred.
- Cycle detection in the **ingredient hierarchy** (`ingredients.parent_id`) — that's PRD-106's concern, enforced at insert.
- Suggesting how to break the cycle — deferred.
