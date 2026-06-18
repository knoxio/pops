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
  | {
      ok: true;
      resolved: ResolvedRecipeAst;
      creations: ResolverCreation[];
      proposedSlugs: ProposedSlug[];
    }
  | {
      ok: false;
      /**
       * Partial AST — known slugs / indexes filled in; unresolved /
       * wrong-kind refs carry `null` ids. Lets the inbox renderer (Epic 03)
       * draw structure with per-line errors layered on.
       */
      resolved: ResolvedRecipeAst;
      errors: ResolveError[];
      creations: ResolverCreation[];
      proposedSlugs: ProposedSlug[];
    };

export type ResolvedRecipeAst = {
  header: ResolvedHeader;
  yield: ResolvedYield;
  blocks: ResolvedBlock[];
};

export type ResolvedHeader = RecipeHeader; // identical shape; no resolution needed

export type ResolvedYield = {
  yieldIngredientId: number; // FK -> ingredients.id
  yieldVariantId: number | null; // FK -> ingredient_variants.id (null = canonical, no variant)
  yieldPrepStateId: number | null; // FK -> prep_states.id
  yieldQty: number;
  yieldUnit: string;
};

// Auto-create instructions: the resolver detected an unknown ingredient or variant slug
// and is asking the compiler (PRD-116) to create it before materialising.
// prep_state slugs are NOT auto-created (curated enum); unknown prep slugs are errors.
export type ResolverCreation =
  | { kind: 'ingredient'; slug: string; defaultUnit: 'g' | 'ml' | 'count'; fromLoc: SourceSpan }
  | {
      kind: 'variant';
      parentIngredientSlug: string;
      slug: string;
      defaultUnit: 'g' | 'ml' | 'count';
      fromLoc: SourceSpan;
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
  | 'UnresolvedPrepStateSlug' // prep states are curated; unknown = error
  | 'UnresolvedYieldIngredient' // @yield slug doesn't resolve and can't be auto-created (e.g. it's an unpromoted recipe)
  | 'YieldCannotBeRecipe' // @yield references a recipe whose own yield is null
  | 'UnresolvedStepRefIndex' // @N in step body with no matching @ingredient(N, ...)
  | 'UnresolvedStepRefSlug' // @slug in step body that doesn't resolve to any known slug
  | 'WrongKindForContext' // e.g. prep_state slug used where ingredient expected
  | 'SelfReferenceRecipe' // current recipe references itself (was 'UnresolvedRecipeSlug')
  | 'VariantOnRecipeRef' // @ingredient(N, recipe-slug:something, ...) — variants meaningless on recipe refs
  | 'AmbiguousSlug'; // defensive — slug_registry returned multiple rows
```

**Auto-creation replaces several previously-erroring codes.** Unknown ingredient slugs and unknown variant slugs no longer produce errors; the resolver emits a `ResolverCreation` instead. The compiler (PRD-116) processes creations atomically before materialising. `UnresolvedIngredientSlug`, `UnresolvedVariantSlug`, and the old `UnresolvedRecipeSlug` (which was misnamed — only used for self-references) are removed.

## Resolution Algorithm

For each AST node that references a slug:

1. **`@ingredient(N, slug:variant:prep, qty:unit, ...)`**
   - Look up `slug` in `slug_registry`.
   - **If not found** → emit `ResolverCreation { kind: 'ingredient', slug, defaultUnit: deriveFromQty(qty.unit) }` and treat as resolved for downstream processing. The compiler (PRD-116) will create the row before materialising; ingredientId is assigned post-creation.
   - If found with `kind='ingredient'` → `ingredientId = target_id`, `isRecipeRef = false`.
   - If found with `kind='recipe'` → resolve the recipe's `current_version_id`'s `yield_ingredient_id`. `ingredientId = (yield)`, `isRecipeRef = true`, `recipeRef = target_id`. If the recipe has no `current_version_id` yet (only drafts), emit `WrongKindForContext` — you can't compose with an unpromoted recipe.
   - If found with `kind='prep_state'` → emit `WrongKindForContext` (a prep state is not an ingredient).
   - Resolve `variant`: look up `(ingredient_id, variant_slug)` in `ingredient_variants`.
     - **If absent** → emit `ResolverCreation { kind: 'variant', parentIngredientSlug: slug, slug: variant_slug, defaultUnit }`. Treat as resolved; variantId assigned post-creation.
     - If `variant` is non-empty on a recipe ref → emit `VariantOnRecipeRef`. Variants only meaningful on ingredient refs.
   - Resolve `prep`: look up `prep_state_slug` in `slug_registry` with `kind='prep_state'`. **prep_states are curated** — if absent → `ProposedSlug` + `UnresolvedPrepStateSlug` error (no auto-create). If found with wrong kind → `WrongKindForContext`.
   - `_` segments are treated as null (skipped). `banana:_:mashed` resolves to ingredient `banana`, variant null (use ingredient's default), prep `mashed`.

2. **`@yield(slug:variant:prep, qty:unit)`**
   - Look up `slug`. If not found → emit `ResolverCreation { kind: 'ingredient', slug, ... }` (yield ingredients auto-create just like input ingredients). `yieldIngredientId` assigned post-creation.
   - If found with `kind='ingredient'` → `yieldIngredientId = target_id`.
   - If found with `kind='recipe'` → resolve to the recipe's yield ingredient. **`YieldCannotBeRecipe`** if that recipe's yield is null (cycle precursor; PRD-117 handles full cycle detection).
   - Resolve `variant` segment (if present): same as `@ingredient` — auto-create variant under the resolved ingredient if missing. Sets `yieldVariantId`.
   - Resolve `prep` segment (if present): same as `@ingredient` — `kind='prep_state'` required, no auto-create. Sets `yieldPrepStateId`.

3. **Step body refs (`@N` / `@slug` inside step strings)**
   - `@N`: look up the block with `kind='ingredient'` and `index === N` in the current AST. If absent → `UnresolvedStepRefIndex`. Resolved part carries `ingredientId`, `variantId`, `prepStateId` from that ingredient block.
   - `@slug`: look up `slug` in `slug_registry` with `kind='ingredient'` or `kind='recipe'`. If a recipe, resolve to its yield ingredient. If not found OR wrong kind → `ProposedSlug` + `UnresolvedStepRefSlug` (step body refs do NOT auto-create — they're informational pointers, not declarations). Resolved part carries `ingredientId` (variantId/prepStateId null unless the matching `@ingredient` block declared them — in v1 we **only** copy from the matching ingredient block when one exists for the same slug; otherwise variant/prep stay null).

4. **`@time(qty:unit)` / `@temperature(qty:unit)`**
   - No resolution needed; the unit is a free string. Validation of the unit string is out of scope here (PRD-116 may add a known-units check during materialisation).

### `deriveFromQty(unit)` for auto-creation

When the resolver auto-creates an ingredient or variant, it must pick a `default_unit`:

| qty unit                                 | default_unit                            |
| ---------------------------------------- | --------------------------------------- |
| `g`, `kg`, `oz`, `lb`                    | `g`                                     |
| `ml`, `l`, `cup`, `tbsp`, `tsp`, `fl-oz` | `ml`                                    |
| `count`, `each`, `whole`                 | `count`                                 |
| anything else                            | `count` (fallback; user can edit later) |

The fallback exists so an author writing `@ingredient(1, novelty-thing, 1:packet)` doesn't crash the compile. The novel `packet` unit is unknown; default_unit becomes `count` and the user can refine in the ingredient management UI.

### `proposedSlugs` vs `creations`

Two distinct outputs from the resolver, with different downstream handling:

- **`creations`** — fully-determined "create this before materialising" instructions for new ingredients and variants. The compiler executes them in the same transaction; no user prompt needed. Unknown ingredient/variant slugs always flow here.
- **`proposedSlugs`** — informational pointers for the review queue (Epic 03) when an LLM-driven ingest produces a recipe with refs the system can't auto-resolve (e.g. an unknown prep_state slug, or a step body `@slug` that doesn't match anything). The review queue surfaces these as "did you mean...?" prompts.

If `creations.length > 0` AND no other errors, the resolver returns `ok: true` — the compiler will handle the creations. If unresolved errors exist (prep_states, step refs, etc), `ok: false` is returned but `creations` is still populated so the compiler can choose to create what it can and fail on the rest.

### Self-reference handling

If `ctx.currentRecipeId` is set and a step ref or `@ingredient` slug resolves to that recipe, the resolver emits `SelfReferenceRecipe` with a clear message rather than letting it through and relying on PRD-117 to catch the cycle. This is a UX optimisation — a recipe referencing itself is an author error, not a graph issue.

## Business Rules

- Resolver is **read-only** against the DB. No writes, no side effects. (Auto-creation happens in PRD-116's compiler, driven by the `creations` output of this resolver.)
- Resolver is deterministic for a given `(ast, slug_registry snapshot)` pair.
- Errors, `creations`, and `proposedSlugs` are accumulated; resolution does not short-circuit on the first unresolved slug.
- Resolver does NOT perform recipe-graph cycle detection beyond the trivial self-reference case. Full graph cycle detection lives in PRD-117 and runs at materialisation time.
- Resolver does NOT validate `qty:unit` pairs beyond using the unit to derive a `default_unit` for auto-created ingredients. Unknown units carry through to recipe_lines as literal strings.
- Auto-create instructions are batched into `creations`; the compiler is responsible for ordering them (ingredients before variants of those ingredients) and applying them atomically.

## Edge Cases

| Case                                                                                                           | Behaviour                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@ingredient(1, made-up-thing, 250:g)`                                                                         | Emits `creations.push({ kind: 'ingredient', slug: 'made-up-thing', defaultUnit: 'g' })`. Resolves OK; compiler creates row.          |
| `@ingredient(1, banana:made-up-variant, 250:g)` when `banana` exists                                           | Emits `creations.push({ kind: 'variant', parentIngredientSlug: 'banana', slug: 'made-up-variant', defaultUnit: 'g' })`. Resolves OK. |
| `@ingredient(1, smash-patty, 4:count)` where `smash-patty` is an unpromoted draft recipe                       | `WrongKindForContext` — promote the recipe first or change reference                                                                 |
| `@ingredient(1, smash-patty:something, 4:count)` (variant on recipe ref)                                       | `VariantOnRecipeRef` — variants are not meaningful on recipe references                                                              |
| `@ingredient(1, banana:_:mashed, 250:g)`                                                                       | Resolves to ingredient `banana`, variant null, prep `mashed`                                                                         |
| `@ingredient(1, banana:_:never-heard-of-this-prep, 250:g)`                                                     | `UnresolvedPrepStateSlug` + `proposedSlugs.push({ slug, suggestedKind: 'prep_state' })`. prep_states are curated, not auto-created.  |
| `@step("Add the @1 ...")` where `@ingredient(1, ...)` doesn't exist                                            | `UnresolvedStepRefIndex` on the `@1`                                                                                                 |
| `@step("Add the @banana ...")` with no matching `@ingredient(N, banana, ...)` and banana is a known ingredient | Resolves OK; ingredientId from registry; variantId/prepStateId null                                                                  |
| `@step("Add the @banana ...")` and banana is unknown                                                           | `UnresolvedStepRefSlug` + `proposedSlugs` entry. Step refs do NOT auto-create — only `@ingredient` and `@yield` blocks do.           |
| `@yield(banana, 1:count)` where `banana` is an ingredient                                                      | Resolves cleanly                                                                                                                     |
| `@yield(new-output-thing, 4:count)` where slug is unknown                                                      | Emits `creations.push({ kind: 'ingredient', ... })`. Yield auto-creates just like input ingredients.                                 |
| `@yield(flank:braised:shredded, 500:g)` with all three slugs known                                             | Resolves with `yieldIngredientId=flank, yieldVariantId=braised, yieldPrepStateId=shredded`                                           |
| `@yield(flank:never-braised:shredded, 500:g)` with unknown variant                                             | Emits `creations` for the variant; resolves OK.                                                                                      |
| `@yield(smash-patty, 4:count)` where `smash-patty` is a recipe                                                 | Resolves to the recipe's yield ingredient; carries through as own yield                                                              |
| `@yield(smash-patty, 4:count)` where `smash-patty` is an unpromoted recipe                                     | `YieldCannotBeRecipe`                                                                                                                |
| Self-reference: `currentRecipeId=42` and `@ingredient(1, recipe-slug-42, ...)`                                 | `SelfReferenceRecipe` with current recipe slug in message; no graph walk needed                                                      |
| `@ingredient(1, banana, 250:g)` and `@ingredient(2, banana, 100:g)`                                            | Both resolve to the same `ingredientId`; allowed (two separate uses of banana in one recipe)                                         |
| `slug_registry` returns two rows with the same slug (impossible by PK)                                         | If it ever happened: `AmbiguousSlug`. Defensive — flags data corruption.                                                             |

## Acceptance Criteria

Inline per theme protocol.

### Implementation

- [x] `packages/app-food/src/dsl/resolver.ts` exports `resolveRecipeAst(ast, ctx): ResolveResult`. Source split across `resolver.ts`, `resolver-state.ts`, `resolver-types.ts`, `resolve-slug.ts`, `resolve-create.ts`, `resolve-yield.ts`, `resolve-ingredient.ts`, `resolve-step.ts` to stay under the per-file line cap.
- [x] Uses Drizzle parameterised queries (`.where(eq(...))`) only — no string-built SQL with slug values.
- [x] Read-only against the DB — the resolver path never invokes `insert/update/delete`. Auto-creation is delegated to PRD-116's compiler via the `creations[]` output.
- [x] Collects all errors, creations, and proposed slugs; does not short-circuit on first failure (verified by the mixed-path test).

### Tests

- [x] Vitest suite at `packages/app-food/src/dsl/__tests__/resolver.test.ts` — 16 cases. Each `ResolveErrorCode` has a producing case except `AmbiguousSlug`, which is defensive (SQLite PK on `slug_registry` makes it unreachable). Both `@ingredient` and `@yield` heads with a prep_state slug raise `WrongKindForContext` (kind-mismatch, not unresolved).
- [x] Happy path: 3-ingredient recipe with known ingredients + a `banana:raw:mashed` descriptor + a step body `@N` ref resolves cleanly with no errors and no proposed slugs. (The PRD suggested 10 ingredients; scaled to 3 for focus — the surface coverage is the same.)
- [x] Mixed path: a recipe with 2 unknown slugs (a prep_state + a step `@slug` ref) → `errors.length === 2` and `proposedSlugs.length === 2`. **`ResolveResult` now includes `resolved` on both branches** so callers can render the partial AST alongside the errors. The mixed-path test asserts `result.resolved.blocks` is non-empty and the known ingredient block has a non-null `ingredientId`.
- [x] Self-reference: `currentRecipeId` set to a seeded recipe's id with an `@ingredient` pointing at that recipe's slug returns `SelfReferenceRecipe`.
- [x] Recipe-as-ingredient: a recipe with `current_version_id` set resolves cleanly through (seeded via `createRecipe` + `promoteVersion`); without it → `WrongKindForContext`.
- [x] Variant scoping: `banana:raw` and `apple:raw` resolve to distinct `variantId`s (per-parent scope from PRD-106).
- [x] `_` skip: `banana:_:mashed` resolves to `{ ingredientId: banana, variantId: null, prepStateId: mashed }`.

### Cross-PRD wiring

- [x] PRD-116 cross-link kept in Out of Scope — compiler consumes `ResolvedRecipeAst` + `creations[]`.
- [x] PRD-117 cross-link kept — cycle detection runs against the materialised result, not at the resolver layer.

## Out of Scope

- Parsing — **PRD-114**.
- Writing to `recipe_lines` / `recipe_steps` tables — **PRD-116**.
- Recipe-graph cycle detection (multi-recipe cycles) — **PRD-117**.
- Unit-known validation for `qty:unit` pairs — **PRD-116** may add; this layer is permissive.
- Suggesting fixes for unresolved slugs (Levenshtein on existing slugs, "did you mean...") — deferred.
- Persisting `proposedSlugs` to the DB — **PRD-116**.
- Surfacing proposed slugs to the user — Epic 03 (review queue).
