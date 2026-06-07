# PRD-115: Recipe DSL Resolver

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Take the AST produced by PRD-114 and resolve every slug reference to a real entity ID via the `slug_registry` (PRD-106) and the parent-scoped variant table (PRD-106). Output: a `ResolvedRecipeAst` with `ingredient_id`, `variant_id`, `prep_state_id`, `yield_ingredient_id`, and `recipe_id` populated on every reference, OR a structured resolution error.

The resolver is the layer where the DSL meets the data. It is the only place that knows about both the AST shape and the `slug_registry`. PRD-114's parser is pure text; PRD-116's compiler writes rows; PRD-115 sits between them.

## Resolver API

```ts
// packages/app-food/src/dsl/resolver.ts
export function resolveRecipeAst(ast: RecipeAst, ctx: ResolveContext): ResolveResult;

export type ResolveContext = {
  db: SqliteDb; // read-only access for lookups
  currentRecipeId?: number; // for self-reference disambiguation
};

export type ResolveResult =
  | { ok: true; resolved: ResolvedRecipeAst; proposedSlugs: ProposedSlug[] }
  | { ok: false; errors: ResolveError[]; proposedSlugs: ProposedSlug[] };

export type ResolvedRecipeAst = {
  header: ResolvedHeader;
  yield: ResolvedYield;
  blocks: ResolvedBlock[];
};

export type ResolvedHeader = RecipeHeader; // identical shape; no resolution needed

export type ResolvedYield = {
  yieldIngredientId: number; // FK -> ingredients.id
  yieldQty: number;
  yieldUnit: string;
};

export type ResolvedBlock =
  | {
      kind: 'ingredient';
      index: number;
      ingredientId: number;
      variantId: number | null;
      prepStateId: number | null;
      qty: number;
      unit: string;
      optional: boolean;
      notes: string | null;
      isRecipeRef: boolean;
      recipeRef: number | null;
      loc: SourceSpan;
    }
  | {
      kind: 'step';
      bodyResolved: ResolvedStepBody;
      duration: QtyUnit | null;
      temperature: QtyUnit | null;
      loc: SourceSpan;
    }
  | { kind: 'markdown'; text: string; loc: SourceSpan };

export type ResolvedStepBody = ResolvedStepBodyPart[];
export type ResolvedStepBodyPart =
  | { kind: 'text'; value: string }
  | {
      kind: 'ref';
      ingredientIndex: number;
      ingredientId: number;
      variantId: number | null;
      prepStateId: number | null;
    }
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };

export type ProposedSlug = {
  slug: string;
  fromLoc: SourceSpan;
  suggestedKind?: 'ingredient' | 'recipe' | 'prep_state'; // best-guess
};

export type ResolveError = {
  code: ResolveErrorCode;
  message: string;
  loc: SourceSpan;
  slug?: string;
};

export type ResolveErrorCode =
  | 'UnresolvedIngredientSlug'
  | 'UnresolvedRecipeSlug'
  | 'UnresolvedPrepStateSlug'
  | 'UnresolvedVariantSlug'
  | 'UnresolvedYieldIngredient'
  | 'YieldCannotBeRecipe'
  | 'UnresolvedStepRefIndex'
  | 'UnresolvedStepRefSlug'
  | 'WrongKindForContext'
  | 'AmbiguousSlug';
```

## Resolution Algorithm

For each AST node that references a slug:

1. **`@ingredient(N, slug:variant:prep, qty:unit, ...)`**
   - Look up `slug` in `slug_registry`.
   - If not found → emit `ProposedSlug { slug, suggestedKind: 'ingredient' }` and `UnresolvedIngredientSlug` error.
   - If found with `kind='ingredient'` → `ingredientId = target_id`, `isRecipeRef = false`.
   - If found with `kind='recipe'` → resolve the recipe's `current_version_id`'s `yield_ingredient_id`. `ingredientId = (yield)`, `isRecipeRef = true`, `recipeRef = target_id`. If the recipe has no `current_version_id` yet (only drafts), emit `WrongKindForContext` — you can't compose with an unpromoted recipe.
   - If found with `kind='prep_state'` → emit `WrongKindForContext` (a prep state is not an ingredient).
   - Resolve `variant`: look up `(ingredient_id, variant_slug)` in `ingredient_variants`. If absent, emit `UnresolvedVariantSlug`. Variants resolve under the **ingredient** that the descriptor points to (not under a recipe yield's ingredient — recipe references skip variant scoping; if variant is non-empty on a recipe ref, emit `WrongKindForContext`).
   - Resolve `prep`: look up `prep_state_slug` in `slug_registry` with `kind='prep_state'`. If absent → `ProposedSlug` + `UnresolvedPrepStateSlug`. If found with wrong kind → `WrongKindForContext`.
   - `_` segments are treated as null (skipped). `banana:_:mashed` resolves to ingredient `banana`, variant null (use ingredient's default), prep `mashed`.

2. **`@yield(slug, qty:unit)`**
   - Look up `slug`. Must resolve to `kind='ingredient'` or `kind='recipe'`. If recipe → resolve to the recipe's yield (you can declare your yield as another recipe's yield, though this is unusual).
   - **`YieldCannotBeRecipe`** if the slug is a recipe AND that recipe's yield is null (cycle precursor; PRD-117 handles full cycle detection).
   - Variant on yield is not supported in v1 (`@yield(banana:raw, ...)` is parsed but emits `UnresolvedVariantSlug` — yield is the canonical ingredient only).

3. **Step body refs (`@N` / `@slug` inside step strings)**
   - `@N`: look up the block with `kind='ingredient'` and `index === N` in the current AST. If absent → `UnresolvedStepRefIndex`. Resolved part carries `ingredientId`, `variantId`, `prepStateId` from that ingredient block.
   - `@slug`: look up `slug` in `slug_registry` with `kind='ingredient'` or `kind='recipe'`. If a recipe, resolve to its yield ingredient. If not found OR wrong kind → `ProposedSlug` + `UnresolvedStepRefSlug`. Resolved part carries `ingredientId` (variantId/prepStateId null unless the matching `@ingredient` block declared them — in v1 we **only** copy from the matching ingredient block when one exists for the same slug; otherwise variant/prep stay null).

4. **`@time(qty:unit)` / `@temperature(qty:unit)`**
   - No resolution needed; the unit is a free string. Validation of the unit string is out of scope here (PRD-116 may add a known-units check during materialisation).

### `proposedSlugs` semantics

Unknown slugs are tracked in `proposedSlugs[]` separately from errors so that PRD-116 can persist them on the `recipe_versions` row even when compile fails. Epic 03's review queue reads `proposedSlugs` to drive the "create these ingredients?" prompt during draft approval.

If `proposedSlugs.length > 0`, the resolver still returns `ok: false` (errors include the unresolved-slug errors). The materialiser (PRD-116) sees both arrays and decides whether to surface as a fixable error or block compile.

### Self-reference handling

If `ctx.currentRecipeId` is set and a step ref or `@ingredient` slug resolves to that recipe, the resolver emits `UnresolvedRecipeSlug` with a clear "self-reference" message rather than letting it through and relying on PRD-117 to catch the cycle. This is a UX optimisation — a recipe referencing itself is an author error, not a graph issue.

## Business Rules

- Resolver is **read-only** against the DB. No writes, no side effects.
- Resolver is deterministic for a given `(ast, slug_registry snapshot)` pair.
- Errors and `proposedSlugs` are accumulated; resolution does not short-circuit on the first unresolved slug.
- Resolver does NOT perform recipe-graph cycle detection beyond the trivial self-reference case. Full graph cycle detection lives in PRD-117 and runs at materialisation time, with access to the resolved recipe_lines from PRD-116.
- Resolver does NOT validate `qty:unit` pairs (PRD-116 may add a unit-known check). `@ingredient(1, banana, 250:foo)` resolves successfully with `unit='foo'`.

## Edge Cases

| Case                                                                                                           | Behaviour                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `@ingredient(1, made-up-thing, 250:g)`                                                                         | `UnresolvedIngredientSlug` + `proposedSlugs.push({ slug: 'made-up-thing', suggestedKind: 'ingredient' })`                             |
| `@ingredient(1, banana:made-up-variant, 250:g)` when `banana` exists                                           | `UnresolvedVariantSlug` (ingredient resolves; variant doesn't). NOT added to proposedSlugs — variants are not in the global registry. |
| `@ingredient(1, smash-patty, 4:count)` where `smash-patty` is an unpromoted draft recipe                       | `WrongKindForContext` — promote the recipe first or change reference                                                                  |
| `@ingredient(1, smash-patty:something, 4:count)` (variant on recipe ref)                                       | `WrongKindForContext` — variants are not meaningful on recipe references                                                              |
| `@ingredient(1, banana:_:mashed, 250:g)`                                                                       | Resolves to ingredient `banana`, variant null, prep `mashed`                                                                          |
| `@step("Add the @1 ...")` where `@ingredient(1, ...)` doesn't exist                                            | `UnresolvedStepRefIndex` on the `@1`                                                                                                  |
| `@step("Add the @banana ...")` with no matching `@ingredient(N, banana, ...)` and banana is a known ingredient | Resolves OK; ingredientId from registry; variantId/prepStateId null                                                                   |
| `@step("Add the @banana ...")` and banana is unknown                                                           | `UnresolvedStepRefSlug` + `proposedSlugs` entry                                                                                       |
| `@yield(banana, 1:count)` where `banana` is an ingredient                                                      | Resolves cleanly                                                                                                                      |
| `@yield(smash-patty, 4:count)` where `smash-patty` is a recipe                                                 | Resolves to the recipe's yield ingredient; carries through as own yield                                                               |
| `@yield(smash-patty, 4:count)` where `smash-patty` is an unpromoted recipe                                     | `YieldCannotBeRecipe`                                                                                                                 |
| Self-reference: `currentRecipeId=42` and `@ingredient(1, recipe-slug-42, ...)`                                 | `UnresolvedRecipeSlug` with self-reference message; no graph walk needed                                                              |
| `@ingredient(1, banana, 250:g)` and `@ingredient(2, banana, 100:g)`                                            | Both resolve to the same `ingredientId`; allowed (two separate uses of banana in one recipe)                                          |
| `slug_registry` returns two rows with the same slug (impossible by PK)                                         | If it ever happened: `AmbiguousSlug`. Defensive — flags data corruption.                                                              |

## Acceptance Criteria

Inline per theme protocol.

### Implementation

- [ ] `packages/app-food/src/dsl/resolver.ts` exports `resolveRecipeAst(ast, ctx): ResolveResult` matching the signature above.
- [ ] Resolver uses prepared statements / parameterised queries only — no string-built SQL with slug values.
- [ ] Resolver does not write to the DB (verified by passing a read-only Drizzle handle in tests).
- [ ] Resolver collects all errors and proposed slugs; does not short-circuit on first failure.

### Tests

- [ ] Vitest suite at `packages/app-food/src/dsl/__tests__/resolver.test.ts` covers each `ResolveErrorCode` with a reliable producing case.
- [ ] Happy path: a 10-ingredient recipe with known ingredients, two variants, one recipe-as-ingredient ref, and three step body refs resolves to a fully-populated `ResolvedRecipeAst` with no errors and no proposed slugs.
- [ ] Mixed path: same recipe with 2 deliberately unknown slugs → resolves with `errors.length === 2` and `proposedSlugs.length === 2`, AST still produced (partial resolution where possible — known slugs are filled in).
- [ ] Self-reference: `currentRecipeId=42` with an `@ingredient` pointing at the recipe-with-id-42's slug returns `UnresolvedRecipeSlug` with `"self-reference"` in the message.
- [ ] Recipe-as-ingredient: a recipe with `current_version_id` set resolves cleanly through; without `current_version_id` → `WrongKindForContext`.
- [ ] Variant scoping: ingredient `banana` with variant `raw`, and ingredient `apple` with variant `raw` — `@ingredient(1, banana:raw, ...)` and `@ingredient(2, apple:raw, ...)` resolve to distinct `variantId`s.
- [ ] `_` skip: `banana:_:mashed` resolves to `{ ingredientId: banana, variantId: null, prepStateId: mashed }`.

### Cross-PRD wiring

- [ ] PRD-116 cross-link landed (compiler consumes `ResolvedRecipeAst`).
- [ ] PRD-117 cross-link landed (cycle detection runs against the materialised result, not at this layer).

## Out of Scope

- Parsing — **PRD-114**.
- Writing to `recipe_lines` / `recipe_steps` tables — **PRD-116**.
- Recipe-graph cycle detection (multi-recipe cycles) — **PRD-117**.
- Unit-known validation for `qty:unit` pairs — **PRD-116** may add; this layer is permissive.
- Suggesting fixes for unresolved slugs (Levenshtein on existing slugs, "did you mean...") — deferred.
- Persisting `proposedSlugs` to the DB — **PRD-116**.
- Surfacing proposed slugs to the user — Epic 03 (review queue).
