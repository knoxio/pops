# Recipe DSL Resolver

Status: Done — `resolveRecipeAst` resolves every slug in a parsed recipe AST to entity ids, emits auto-create instructions and review-queue pointers, and is consumed by the compiler. No gaps.

## Purpose

The resolver sits between the DSL parser (which produces a pure-text `RecipeAst`) and the compiler (which writes recipe rows). It is the only layer that knows about both the AST shape and the food pillar's `slug_registry`. Given a `RecipeAst` and a read-only DB handle, it resolves every slug reference (`ingredient`, `variant`, `prep_state`, recipe-as-ingredient, `@yield`, inline step refs) to a real entity id, or produces a structured resolution error.

Output is a `ResolvedRecipeAst` with `ingredientId` / `variantId` / `prepStateId` / `recipeRef` populated on every reference, plus two side channels: `creations` (auto-create-this-first instructions for unknown ingredient/variant slugs) and `proposedSlugs` (informational pointers for the Epic 03 review queue).

## Code

- `pillars/food/src/dsl/resolver.ts` — `resolveRecipeAst(ast, ctx): ResolveResult`. Logic split across `resolver-state.ts`, `resolver-types.ts`, `resolve-slug.ts`, `resolve-create.ts`, `resolve-yield.ts`, `resolve-ingredient.ts`, `resolve-step.ts` to stay under the per-file line cap.
- Pure logic barrel: `pillars/food/src/dsl/index.ts` re-exports `resolveRecipeAst` + types. No public package surface (`public.ts` is parser-only; the resolver needs a `FoodDb` and runs server-side).
- Reads `slug_registry`, `ingredient_variants`, `prep_states`, `recipes`, `recipe_versions` (schema in `pillars/food/src/db/schema/food-ingredients.ts` and `food-recipes.ts`).

## Resolver Contract

```ts
function resolveRecipeAst(ast: RecipeAst, ctx: ResolveContext): ResolveResult;

interface ResolveContext {
  db: FoodDb; // Drizzle handle, read-only lookups only
  currentRecipeId?: number; // self-reference disambiguation
}

type ResolveResult =
  | {
      ok: true;
      resolved: ResolvedRecipeAst;
      creations: ResolverCreation[];
      proposedSlugs: ProposedSlug[];
    }
  | {
      ok: false;
      resolved: ResolvedRecipeAst;
      errors: ResolveError[];
      creations: ResolverCreation[];
      proposedSlugs: ProposedSlug[];
    };
```

`resolved` is present on BOTH branches — known slugs/indexes filled, unresolved/wrong-kind refs carry `null` ids — so the inbox renderer (Epic 03) can draw structure with per-line errors layered on. Ids that will be auto-created are `null` until the compiler creates the row and re-resolves.

### Error codes

`UnresolvedPrepStateSlug`, `UnresolvedYieldIngredient`, `YieldCannotBeRecipe`, `UnresolvedStepRefIndex`, `UnresolvedStepRefSlug`, `WrongKindForContext`, `SelfReferenceRecipe`, `VariantOnRecipeRef`, `AmbiguousSlug` (defensive — `slug_registry` PK makes it unreachable). Unknown ingredient/variant slugs do NOT error — they become `creations`.

## Resolution Algorithm

For each AST node referencing a slug (errors, creations, and proposedSlugs accumulate — no short-circuit):

1. **`@ingredient(N, slug:variant:prep, qty:unit, ...)`**
   - Look up `slug` in `slug_registry`. Not found → push `ResolverCreation { kind:'ingredient', defaultUnit: deriveFromQty(unit) }`, treat as resolved (`ingredientId` filled post-creation).
   - `kind='ingredient'` → `ingredientId = targetId`, `isRecipeRef=false`.
   - `kind='recipe'` → resolve the recipe's `current_version_id` yield: `ingredientId = yieldIngredientId`, `isRecipeRef=true`, `recipeRef=recipeId`. No promoted current version (only drafts) → `WrongKindForContext`. Recipe == `currentRecipeId` → `SelfReferenceRecipe`.
   - `kind='prep_state'` → `WrongKindForContext`.
   - `variant`: look up `(ingredientId, variantSlug)` in `ingredient_variants`. Absent → variant `ResolverCreation`. On a recipe ref → `VariantOnRecipeRef`.
   - `prep`: look up in `slug_registry` requiring `kind='prep_state'`. Absent → `UnresolvedPrepStateSlug` + `proposedSlug` (curated; never auto-created). Wrong kind → `WrongKindForContext`.
   - `_` segments are null (skipped): `banana:_:mashed` → ingredient `banana`, variant null, prep `mashed`.

2. **`@yield(slug:variant:prep, qty:unit)`** — same head/variant/prep logic. Not found → ingredient `ResolverCreation`. `kind='recipe'` → adopt that recipe's own yield (ingredient/variant/prep); if that recipe's yield is null → `YieldCannotBeRecipe`. A `prep_state` in the head slot → `WrongKindForContext`. Empty yield (`none`/0) short-circuits to a null yield.

3. **Step body refs (`@N` / `@slug`)** — resolved after ingredient blocks so `@N` lands.
   - `@N`: match an `@ingredient` block with `index===N`; absent → `UnresolvedStepRefIndex`. Copies that block's `ingredientId`/`variantId`/`prepStateId`.
   - `@slug`: if a same-slug `@ingredient` block exists, copy its ids (incl. variant/prep). Else look up `slug_registry` requiring `ingredient`/`recipe` (recipe → its yield ingredient; self-reference → `SelfReferenceRecipe`). Not found or `prep_state` → `UnresolvedStepRefSlug` + `proposedSlug`. Step refs NEVER auto-create — only `@ingredient`/`@yield` declare.

4. **`@time(qty:unit)` / `@temperature(qty:unit)`** — carried through verbatim; no resolution.

### `deriveFromQty(unit)` for auto-creation

| qty unit                                 | default_unit                           |
| ---------------------------------------- | -------------------------------------- |
| `g`, `kg`, `oz`, `lb`                    | `g`                                    |
| `ml`, `l`, `cup`, `tbsp`, `tsp`, `fl-oz` | `ml`                                   |
| `count`, `each`, `whole`                 | `count`                                |
| anything else                            | `count` (fallback; user refines later) |

Unit matching is case-insensitive. The fallback keeps a novel unit (`1:packet`) from crashing the compile.

## Business Rules

- Read-only against the DB: the resolver path never calls `insert/update/delete`. Auto-creation is delegated to the compiler, which applies `creations` (ingredients before their variants) atomically, then re-runs `resolveRecipeAst` so ids land.
- Deterministic for a given `(ast, slug_registry snapshot)` pair.
- All lookups use Drizzle parameterised queries (`.where(eq(...))`) — no string-built SQL with slug values.
- `prep_state` slugs are curated: unknown → error + proposedSlug, never auto-created.
- `creations` and `proposedSlugs` are distinct channels: creations are fully-determined "create before materialise" instructions the compiler executes with no prompt; proposedSlugs are "did you mean…?" pointers for the review queue. `creations.length > 0` with no other errors still returns `ok: true`; if real errors exist, `ok: false` but `creations` is still populated so the compiler can create what it can.
- No recipe-graph cycle detection beyond the trivial self-reference case (full graph cycles live in the cycle detector at materialisation time). No `qty:unit` validation beyond deriving a `default_unit` — unknown units carry through as literal strings.

## Edge Cases

| Case                                                             | Behaviour                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@ingredient(1, made-up-thing, 250:g)`                           | `creations.push({ kind:'ingredient', defaultUnit:'g' })`; resolves OK |
| `@ingredient(1, banana:made-up-variant, 250:g)` (banana exists)  | variant `creation`; resolves OK                                       |
| `@ingredient(1, smash-patty, 4:count)` (unpromoted draft recipe) | `WrongKindForContext`                                                 |
| `@ingredient(1, smash-patty:x, 4:count)` (variant on recipe ref) | `VariantOnRecipeRef`                                                  |
| `@ingredient(1, banana:_:mashed, 250:g)`                         | ingredient `banana`, variant null, prep `mashed`                      |
| `@ingredient(1, banana:_:never-heard-of, 250:g)`                 | `UnresolvedPrepStateSlug` + proposedSlug                              |
| `@step("@1 …")` with no `@ingredient(1, …)`                      | `UnresolvedStepRefIndex`                                              |
| `@step("@banana …")`, banana known, no matching block            | resolves OK; ingredientId from registry, variant/prep null            |
| `@step("@banana …")`, banana unknown                             | `UnresolvedStepRefSlug` + proposedSlug (no auto-create)               |
| `@yield(new-output-thing, 4:count)` (unknown)                    | ingredient `creation`; resolves OK                                    |
| `@yield(flank:braised:shredded, 500:g)` all known                | yieldIngredientId/yieldVariantId/yieldPrepStateId set                 |
| `@yield(smash-patty, 4:count)` (promoted recipe)                 | adopts that recipe's yield                                            |
| `@yield(smash-patty, 4:count)` (unpromoted)                      | `YieldCannotBeRecipe`                                                 |
| `currentRecipeId=42` and `@ingredient(1, recipe-slug-42, …)`     | `SelfReferenceRecipe`                                                 |
| two `@ingredient(_, banana, …)` blocks                           | both resolve to the same `ingredientId` (allowed)                     |
| `slug_registry` returns two rows for one slug                    | `AmbiguousSlug` (unreachable via PK; flags corruption)                |

## Acceptance Criteria

- [x] `resolveRecipeAst(ast, ctx): ResolveResult` exported from `pillars/food/src/dsl/resolver.ts`; logic split across the `resolve-*` / `resolver-*` modules.
- [x] Read-only against the DB — never invokes insert/update/delete; auto-creation delegated to the compiler via `creations[]`.
- [x] All slug lookups use Drizzle parameterised `.where(eq(...))` queries — no string-built SQL.
- [x] Errors, creations, and proposedSlugs accumulate without short-circuiting (mixed-path test: 2 unknown slugs → 2 errors + 2 proposedSlugs, and `resolved.blocks` non-empty with the known ingredient's `ingredientId` non-null).
- [x] `ResolveResult` carries `resolved` on both `ok:true` and `ok:false`.
- [x] Vitest suite `pillars/food/src/dsl/__tests__/resolver.test.ts` — 16 cases; every `ResolveErrorCode` has a producing case except `AmbiguousSlug` (defensive, unreachable via SQLite PK).
- [x] Happy path: known ingredients + a `banana:raw:mashed` descriptor + a step `@N` ref resolve cleanly (no errors, no proposed slugs).
- [x] Unknown ingredient slug → ingredient `creation` (not an error); unknown variant under a known ingredient → variant `creation`.
- [x] `deriveFromQty` picks `g` for weight family, `ml` for volume, `count` fallback.
- [x] Self-reference: `currentRecipeId` matching an `@ingredient` recipe ref → `SelfReferenceRecipe`.
- [x] Recipe-as-ingredient resolves through when `current_version_id` is set; `WrongKindForContext` without it.
- [x] Variant scoping: `banana:raw` and `apple:raw` resolve to distinct `variantId`s (per-parent scope).
- [x] `_` skip: `banana:_:mashed` → `{ ingredientId: banana, variantId: null, prepStateId: mashed }`.
- [x] Consumed by the compiler: it calls `resolveRecipeAst`, applies `creations`, then re-runs `resolveRecipeAst` to fill ids before materialising.

## Out of Scope (other PRDs)

- Parsing → the DSL parser. Writing `recipe_lines` / `recipe_steps` → the compiler. Multi-recipe cycle detection → the cycle detector at materialise time. `qty:unit` known-unit validation → the compiler (permissive here). Persisting / surfacing proposedSlugs → the compiler + Epic 03 review queue.
- Levenshtein "did you mean…?" suggestions for unresolved slugs — see `pillars/food/docs/ideas/dsl-resolver-slug-suggestions.md`.
