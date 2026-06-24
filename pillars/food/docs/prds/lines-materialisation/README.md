# Recipe Lines & Steps Materialisation

Status: Done. `compileRecipeVersion` ships in `pillars/food/src/dsl/compile.ts`; the three tables exist in `pillars/food/src/db/schema/food-compile.ts`. The original PRD scoped conversion as "v1 identity carry-over"; that has since been upgraded to real `unit_conversions` + `ingredient_weights` lookups (so the old "Conversion Table is out of scope" note is obsolete and dropped here).

The queryable index of a compiled recipe version. Compile takes a recipe version's `body_dsl`, runs parse → resolve → cycle-detect → materialise in one transaction, and writes `recipe_lines`, `recipe_steps`, and `recipe_version_proposed_slugs` rows alongside a header update on `recipe_versions`. This is where the DSL stops being text and becomes rows the planner, solver, and shopping-list generators can read.

## Data Model

### `recipe_lines` — one row per `@ingredient(N, ...)` block

`id`, `recipe_version_id` (FK → recipe_versions), `position` (= DSL index N, 1-based), `ingredient_id` (FK), `variant_id` (FK, nullable), `prep_state_id` (FK, nullable), `is_recipe_ref` (0/1), `recipe_ref_id` (FK → recipes, nullable), `original_text` (descriptor as authored, e.g. `banana:raw:mashed`), `original_qty`, `original_unit`, `qty_g`, `qty_ml`, `qty_count`, `canonical_unit` ∈ {`g`,`ml`,`count`}, `optional` (0/1), `notes`.

- Unique index `(recipe_version_id, position)`; index on `ingredient_id`; partial index on `recipe_ref_id WHERE NOT NULL`.
- `original_*` preserve what the author wrote; `qty_*` + `canonical_unit` carry the normalised metric form for aggregation. At most one of `qty_g`/`qty_ml`/`qty_count` is non-null — the materialiser is the single writer and keeps them consistent (no DB CHECK).

### `recipe_steps` — one row per `@step(...)` block

`id`, `recipe_version_id` (FK), `position` (1-based), `body_md` (render-ready: `@N`/`@slug`/time/temperature refs rewritten to markdown anchors), `body_resolved_json` (serialised `ResolvedStepBody` for cooking-mode UI), `duration_minutes` (nullable), `temperature_value` (nullable), `temperature_unit` ∈ {`c`,`f`,`gas`} (nullable).

- Unique index `(recipe_version_id, position)`.

### `recipe_version_proposed_slugs` — unresolved-slug pointers

`id`, `recipe_version_id` (FK), `slug`, `suggested_kind` ∈ {`ingredient`,`recipe`,`prep_state`} (nullable), `from_loc_json` (SourceSpan as JSON), `created_at`.

- Indexes on `recipe_version_id` and `slug`.
- Owned by the version: every compile deletes all rows for that `recipe_version_id` then inserts the fresh set. Read by the inbox-inspector / recipe-drafts queries to drive a "create these?" prompt without re-parsing.

## Compile Function

`compileRecipeVersion(versionId, db): CompileResult` — lives in `pillars/food/src/dsl` (pillar-internal; the DSL barrel is not re-exported on the `@pops/food` public exports map). Synchronous (better-sqlite3 driver is sync). Runs in one Drizzle transaction; on any thrown DB error the transaction rolls back and the caller gets a `MaterialiseError`.

```ts
type CompileResult =
  | { ok: true; lineCount: number; stepCount: number; creationCount: number }
  | {
      ok: false;
      phase: 'parse' | 'resolve' | 'cycle' | 'materialise';
      errors: readonly CompileError[];
    };
```

Pipeline (in-transaction):

1. Load `body_dsl` for the version; `parseRecipeDsl`. On failure → `failParse` (clears stale proposed-slugs too) and return `phase: 'parse'`.
2. `resolveRecipeAst`. If the resolver returned `creations` (auto-create ingredients then variants by slug, via the ingredient/variant services), apply them and re-resolve the original AST against the now-populated `slug_registry`.
3. Persist proposed-slugs (delete-then-insert from `resolved.proposedSlugs`), always — informational even on failure.
4. If resolve still has errors → `failResolve`, return `phase: 'resolve'` (proposed-slug count carried in error JSON).
5. `detectRecipeCycle` between resolve and materialise. On cycle → `failCycle`, return `phase: 'cycle'`.
6. Materialise: delete prior `recipe_lines`/`recipe_steps` for the version, insert fresh rows from `resolved.blocks`. Per line, normalise qty via `normaliseLineQty` (3-step lookup in `unit_conversions` / `ingredient_weights`; unresolved → null qty + ingredient's `default_unit`). Per step, render `body_md` from the `ResolvedStepBody`.
7. `updateHeader`: write `title`, `summary`, `servings`, `prep_minutes`, `cook_minutes`, the `yield_*` columns, `compile_status='compiled'`, `compile_error=NULL`, `compiled_at=now()` from the resolved header/yield.

Failure paths (`compile-finalise.ts`) all set `compile_status='failed'`, write structured `compile_error` JSON, clear lines/steps, and bump `compiled_at`. `compile_error` JSON shape: `{ phase, errors, proposedSlugsCount, extra? }` — UI consumers parse it for editor annotations and the proposed-slug prompt.

Markdown rewriting (`compile-md.ts`): `@N` → `[label](#line-N)`, `@slug` → `[slug](#ingredient-slug)`, time → `[qty unit](#timer)`, temperature → `[qty°unit](#temperature)`. Anchor IDs are stable per `(version_id, line_position)`.

## Business Rules

- Compile is explicit — no auto-compile trigger. The service callers `recipes/save.ts` and `recipes/create.ts` invoke it immediately after writing `body_dsl`; the seed pipeline invokes it per recipe.
- Idempotent: compiling an unchanged version twice yields the same rows (only `compiled_at` updates).
- Atomic: a failure leaves a consistent version (no half-written lines).
- A `compile_status='failed'` version has zero `recipe_lines` and zero `recipe_steps`, always. Planner/solver MUST filter `compile_status='compiled'` before reading lines.
- `recipe_lines.position` matches the DSL `@ingredient(N, ...)` index exactly; re-ordering re-numbers.
- `recipe_versions.compile_status`, `compile_error`, `compiled_at` are written exclusively by compile.

## Edge Cases

| Case                                     | Behaviour                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Compile on an already-`compiled` version | Re-parses, re-resolves, re-materialises. Idempotent.                                                             |
| Empty `body_dsl`                         | Parser raises `MissingRecipeHeader`; parse-phase failure, rows + proposed-slugs cleared.                         |
| Resolve errors AND proposed slugs        | Proposed-slugs persisted; lines/steps cleared; compile fails.                                                    |
| Unknown ingredient slug                  | Auto-created via the ingredient service inside the transaction; compile succeeds.                                |
| Unknown prep_state slug                  | prep_states are curated (not auto-created) → resolve-phase failure with a proposed-slug row.                     |
| Re-compile with a different unknown slug | Prior proposed-slug rows replaced by the new set.                                                                |
| FK violation mid-insert                  | Transaction rolls back; `MaterialiseError` carrying the SQLite constraint message.                               |
| Unit not convertible                     | `qty_*` stay null; `canonical_unit` = ingredient's `default_unit`. Compile succeeds; aggregation skips the line. |
| Zero `@ingredient` blocks                | `recipe_lines` empty (allowed).                                                                                  |
| Zero `@step` blocks                      | `recipe_steps` empty (allowed).                                                                                  |
| Referenced ingredient renamed            | Next compile picks up the new id correctly; FK keeps old rows valid until then.                                  |
| Self-referencing recipe slug             | Resolve-phase error before cycle detection runs.                                                                 |

## Acceptance Criteria

- [x] `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs` exist with the columns, unique indexes, and FKs above (`food-compile.ts`).
- [x] `compileRecipeVersion(versionId, db)` is sync, runs in one Drizzle transaction, returns the `CompileResult` union; thrown DB errors roll back to a `MaterialiseError`.
- [x] On parse/resolve/cycle failure: `compile_status='failed'`, `compile_error` JSON populated, lines/steps cleared, proposed-slugs persisted (resolve) or cleared (parse).
- [x] On success: lines/steps populated, `compile_status='compiled'`, header + `yield_*` columns updated from the parsed `@recipe(...)` header.
- [x] Auto-creation: unknown ingredient slug is created and the recipe compiles; unknown prep_state surfaces a proposed-slug instead.
- [x] Normalisation resolves canonical qty via `unit_conversions` / `ingredient_weights`; unconvertible units fall back to ingredient `default_unit` with null qty.
- [x] Markdown step-ref rewriting produces stable anchors per `(version_id, line_position)`.
- [x] Cycle detection (recipe-cycle PRD) runs between resolve and materialise.
- [x] Vitest suite `pillars/food/src/dsl/__tests__/compile.test.ts` covers happy path (exact row counts + header columns), idempotency, replace/shrink semantics, every failure phase, auto-creation, proposed-slug replacement, and conversion paths.
