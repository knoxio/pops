# PRD-116: Recipe Lines & Steps Materialisation

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the queryable index of a compiled recipe version: the `recipe_lines` and `recipe_steps` tables, plus the `recipe_version_proposed_slugs` table that holds unresolved-slug pointers from a failed compile. Define the `compileRecipeVersion(versionId)` function that takes a `ResolvedRecipeAst` (PRD-115) and writes these tables atomically, also updating `compile_status`, `compile_error`, and `compiled_at` on `recipe_versions` (PRD-107).

This is where the DSL stops being text and starts being queryable rows. Without this PRD's tables, the planner, solver, and shopping-list generators (Epics 04-07) have nothing to read.

## Data Model

### `recipe_lines`

```sql
CREATE TABLE recipe_lines (
  id                INTEGER PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
  position          INTEGER NOT NULL,            -- ingredient index from DSL (1-based)
  ingredient_id     INTEGER NOT NULL REFERENCES ingredients(id),
  variant_id        INTEGER REFERENCES ingredient_variants(id),
  prep_state_id     INTEGER REFERENCES prep_states(id),
  is_recipe_ref     INTEGER NOT NULL DEFAULT 0,  -- 1 if descriptor was a recipe slug
  recipe_ref_id     INTEGER REFERENCES recipes(id),
  original_text     TEXT NOT NULL,                -- the descriptor as it appeared in the DSL ("banana:raw:mashed")
  original_qty      REAL NOT NULL,
  original_unit     TEXT NOT NULL,
  qty_g             REAL,                         -- normalised metric weight
  qty_ml            REAL,                         -- normalised metric volume
  qty_count         REAL,                         -- normalised count
  canonical_unit    TEXT NOT NULL CHECK (canonical_unit IN ('g','ml','count')),
  optional          INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  CHECK ((is_recipe_ref = 0 AND recipe_ref_id IS NULL) OR (is_recipe_ref = 1 AND recipe_ref_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_recipe_lines_version_position ON recipe_lines(recipe_version_id, position);
CREATE INDEX idx_recipe_lines_ingredient ON recipe_lines(ingredient_id);
CREATE INDEX idx_recipe_lines_recipe_ref ON recipe_lines(recipe_ref_id) WHERE recipe_ref_id IS NOT NULL;
```

One row per `@ingredient(N, ...)` block in the DSL. `position = N`. `original_*` columns preserve what the author wrote ("250:g", "1:cup"). `qty_*` + `canonical_unit` carry the normalised metric form for aggregation (shopping lists, pantry math).

Exactly one of `qty_g`, `qty_ml`, `qty_count` is non-null per row — the one matching `canonical_unit`. A CHECK could enforce this but adds complexity; the materialiser is the single writer and is responsible for setting them consistently. (If we get burned by drift, add the CHECK in a future migration.)

### `recipe_steps`

```sql
CREATE TABLE recipe_steps (
  id                INTEGER PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
  position          INTEGER NOT NULL,            -- 1-based step order from DSL
  body_md           TEXT NOT NULL,                -- step body with refs rendered as markdown spans
  body_resolved_json TEXT NOT NULL,               -- the ResolvedStepBody (JSON) for programmatic use
  duration_minutes  INTEGER,                      -- from @step("...", duration=N:min)
  temperature_value REAL,                         -- from @step("...", temperature=N:c|f)
  temperature_unit  TEXT CHECK (temperature_unit IN ('c','f','gas') OR temperature_unit IS NULL)
);
CREATE UNIQUE INDEX uq_recipe_steps_version_position ON recipe_steps(recipe_version_id, position);
```

One row per `@step(...)` block. `body_md` is a render-ready form where `@N` refs have been rewritten to markdown spans (e.g. `[banana](#recipe-line-1)`); `body_resolved_json` carries the `ResolvedStepBody` structure for the cooking-mode UI (which needs typed references, not markdown). The renderer prefers one or the other based on context.

`duration_minutes`: the `@step("...", duration=N:min)` named arg, hoisted out for fast queries ("which steps in this recipe take more than 10 minutes?"). The same value also appears in `body_resolved_json` as a step-level field; storing twice for query convenience, materialiser keeps them consistent.

### `recipe_version_proposed_slugs`

```sql
CREATE TABLE recipe_version_proposed_slugs (
  id                INTEGER PRIMARY KEY,
  recipe_version_id INTEGER NOT NULL REFERENCES recipe_versions(id),
  slug              TEXT NOT NULL,
  suggested_kind    TEXT CHECK (suggested_kind IN ('ingredient','recipe','prep_state') OR suggested_kind IS NULL),
  from_loc_json     TEXT NOT NULL,                -- SourceSpan as JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_proposed_slugs_version ON recipe_version_proposed_slugs(recipe_version_id);
CREATE INDEX idx_proposed_slugs_slug    ON recipe_version_proposed_slugs(slug);
```

Holds the `ProposedSlug[]` from PRD-115's resolver when compile produces unresolved-slug results. Persisted so Epic 03's review queue can drive a "create these ingredients?" prompt during draft approval without re-parsing.

Rows are owned by the version: when a version recompiles, the materialiser deletes all rows for that `recipe_version_id` and inserts the new set. When the version is deleted, a service-managed cascade clears them in the same transaction (no SQL `ON DELETE CASCADE` — same pattern as PRD-106's slug_registry).

## Compile Function

```ts
// packages/app-food/src/dsl/compile.ts
export async function compileRecipeVersion(versionId: number, db: SqliteDb): Promise<CompileResult>;

export type CompileResult =
  | { ok: true; lineCount: number; stepCount: number; creationCount: number }
  | { ok: false; phase: 'parse' | 'resolve' | 'cycle' | 'materialise'; errors: CompileError[] };

export type CompileError = ParseError | ResolveError | CycleError | MaterialiseError;
```

### Execution

In one Drizzle transaction:

1. SELECT `body_dsl` from `recipe_versions` WHERE `id = versionId`.
2. Call `parseRecipeDsl(body_dsl)` (PRD-114).
3. If parse fails:
   - UPDATE `recipe_versions` SET `compile_status='failed'`, `compile_error = JSON of errors`, `compiled_at = now()`.
   - DELETE existing `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs` rows for this `versionId` (a failed compile clears prior state — the version becomes unusable).
   - Return `{ ok: false, phase: 'parse', errors }`.
4. Call `resolveRecipeAst(ast, { db, currentRecipeId })` (PRD-115).
5. **Process `resolved.creations`** (ingredient/variant auto-creation):
   - Order: ingredients first, then variants (variants reference parent ingredients by slug).
   - For each `creation` of `kind='ingredient'`: call `createIngredient({ slug, name: slug, default_unit })` via PRD-106's service. Slug registry row is inserted in the same call.
   - For each `creation` of `kind='variant'`: look up the parent ingredient (just-created or pre-existing), call `createVariant({ ingredient_id, slug, name: slug, default_unit })`.
   - Slug-registry collisions during creation (e.g. the slug was created by another transaction since resolution): retry resolution once; if still failing → `phase: 'materialise'` error.
   - Re-resolve any AST nodes whose creations succeeded so they now carry the new IDs. (Resolver exposes a helper `applyCreations(ast, creations, db): ResolvedRecipeAst` that does the re-lookup; cheap because all new IDs are now in `slug_registry`.)
6. DELETE existing `recipe_version_proposed_slugs` for `versionId`. INSERT new rows from `resolved.proposedSlugs` (always — proposedSlugs is informational even when resolve ultimately fails).
7. If resolve still has errors after creations (e.g. unresolved prep_states, step refs):
   - UPDATE `recipe_versions` SET `compile_status='failed'`, `compile_error = JSON of errors + proposedSlugs summary`.
   - DELETE existing `recipe_lines`, `recipe_steps` rows for `versionId`.
   - Return `{ ok: false, phase: 'resolve', errors }`.
8. Call `detectRecipeCycle(resolved, { db, currentRecipeId })` (PRD-117). If cycle: same failure pattern with `phase: 'cycle'`.
9. Normalise quantities: for each ingredient block, compute `qty_g | qty_ml | qty_count` and `canonical_unit` using the conversion rules from a future Epic 01 PRD (Conversion Table). For v1 the conversion is identity-or-null: if `original_unit ∈ {'g','ml','count'}` → carry over; otherwise leave normalised fields null and `canonical_unit` defaults to the ingredient's `default_unit`. The Conversion Table PRD upgrades this.
10. DELETE existing `recipe_lines` and `recipe_steps` for `versionId`. INSERT new rows from `resolved.blocks`. Compute `body_md` for each step by rewriting `@N` and `@slug` refs to markdown links.
11. UPDATE `recipe_versions` SET `title`, `summary`, `servings`, `prep_minutes`, `cook_minutes`, `recipe_type` (if present in `@recipe`), `yield_ingredient_id`, `yield_variant_id`, `yield_prep_state_id`, `yield_qty`, `yield_unit`, `compile_status='compiled'`, `compile_error=NULL`, `compiled_at=now()` from the resolved header and yield.
12. Commit transaction.
13. Return `{ ok: true, lineCount, stepCount, creationCount }`.

If any DB call inside the transaction fails (e.g. FK violation that the resolver didn't catch, or a slug-registry collision on creation), the transaction rolls back and the caller sees a `MaterialiseError`. Auto-created rows are rolled back atomically with everything else — no partial state.

### `compile_error` JSON shape

```json
{
  "phase": "resolve",
  "errors": [
    {
      "code": "UnresolvedPrepStateSlug",
      "message": "prep_state slug 'never-heard-of-this' not found (prep_states are curated; create via the prep_state management UI)",
      "loc": { "startLine": 8, "startCol": 17, "endLine": 8, "endCol": 31 },
      "slug": "made-up-thing"
    }
  ],
  "proposedSlugsCount": 1
}
```

UI consumers (Epic 01 editor, Epic 03 review queue) parse this to render annotations in the editor and surface the proposed-slug prompt.

## Business Rules

- Compile is invoked explicitly. There is no auto-compile-on-write trigger; the service layer that writes `body_dsl` is responsible for calling `compileRecipeVersion` immediately afterwards (PRD-107's `createNewVersion` and any "save DSL" service in Epic 01).
- Compile is idempotent: running it twice in succession against an unchanged version produces the same compiled state.
- Compile is atomic: a failure leaves the version in a consistent state (no half-written lines).
- A version with `compile_status='failed'` has zero `recipe_lines` and zero `recipe_steps` rows. Always. The planner/solver MUST filter by `compile_status='compiled'` before reading lines.
- Proposed slugs may exist for any compile state (`compiled`, `failed`, `uncompiled`-after-purge). A successful compile MAY still emit `proposed_slugs` if the recipe had ambiguous-but-resolvable refs the resolver wanted to flag — though v1's resolver only emits proposed slugs on failures. Future-proof.
- `recipe_lines.position` matches the DSL `@ingredient(N, ...)` index exactly. Re-ordering ingredients in the DSL re-numbers them; the materialiser uses what the resolver gave it.
- Markdown rewriting in `body_md`: `@N` → `[descriptor text](#line-N)`. `@slug` → `[slug](#ingredient-slug)`. `@time(N:unit)` → `[N unit](#timer)`. `@temperature(N:unit)` → `[N°unit](#temperature)`. Anchor IDs are stable per version.

## Edge Cases

| Case                                                                               | Behaviour                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compile invoked on a version with `compile_status='compiled'` already              | Re-parses, re-resolves, re-materialises. Idempotent.                                                                                                                                                                                                |
| Compile of an empty `body_dsl`                                                     | Parser raises `MissingRecipeHeader`. Compile fails at parse phase; rows cleared.                                                                                                                                                                    |
| Resolver returns errors AND proposed slugs                                         | proposed_slugs are persisted; recipe_lines/steps are cleared; compile fails.                                                                                                                                                                        |
| FK violation when inserting recipe_lines (e.g. ingredient_id deleted mid-compile)  | Transaction rolls back; `MaterialiseError` with the underlying SQLITE_CONSTRAINT message.                                                                                                                                                           |
| Conversion fails for one ingredient (unit not convertible)                         | qty_g/ml/count stay null on that row; canonical_unit = ingredient's default_unit. Compile succeeds. Shopping-list math will silently skip such lines in aggregation. (Acceptable trade-off — Epic 04 surfaces unconverted ingredients to the user.) |
| Recipe has zero `@ingredient` blocks (a pure-technique recipe like "blanch")       | recipe_lines is empty (0 rows). Allowed. `recipe_steps` carries the technique body.                                                                                                                                                                 |
| Recipe has zero `@step` blocks                                                     | recipe_steps is empty. Allowed but weird; planner ignores recipes with no steps in cooking-mode views.                                                                                                                                              |
| Body_dsl unchanged but slug_registry changed (a referenced ingredient was renamed) | Next compile picks up the new ingredient_id correctly. Old recipe_lines still pointed at the same ingredient_id row (FK), so no data loss.                                                                                                          |
| Compile of a version whose `currentRecipeId` self-references a recipe slug         | PRD-115 emits self-reference error; compile fails at resolve phase before cycle detection runs.                                                                                                                                                     |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `recipe_lines`, `recipe_steps`, `recipe_version_proposed_slugs` per the SQL above.
- [x] All UNIQUE indexes and FKs verified via `PRAGMA index_list` and `PRAGMA foreign_key_list`.
- [x] Drizzle types regenerated; tables exported from `packages/db-types`.

### Compile function

- [x] `packages/app-food/src/dsl/compile.ts` exports `compileRecipeVersion(versionId, db): CompileResult` matching the API above (sync because the underlying drizzle/better-sqlite3 driver is sync).
- [x] Compile runs in a single Drizzle transaction; all DB operations participate.
- [x] On parse/resolve/cycle failure: `compile_status='failed'`, error JSON populated, lines/steps cleared, proposed_slugs persisted.
- [x] On success: lines/steps populated, `compile_status='compiled'`, header columns on `recipe_versions` updated from the parsed `@recipe(...)` header.
- [x] Markdown rewriting for step refs produces stable anchor IDs per `(version_id, line_position)`.

### Tests

- [x] Vitest suite at `packages/app-food/src/dsl/__tests__/compile.test.ts` covers each failure phase with at least one case, verifying both the returned `CompileResult` and the DB state afterwards.
- [x] Happy path: a 5-ingredient, 3-step recipe compiles; assert exact row counts in `recipe_lines` and `recipe_steps`; assert header columns on `recipe_versions` match the DSL.
- [x] Idempotency: compile, compile again, assert no row count changes and `compiled_at` updates.
- [x] Replace semantics: compile recipe A with 5 lines, edit body_dsl to 3 lines, recompile, assert exactly 3 lines and the prior 5 are gone.
- [x] Proposed slugs: a recipe with one unknown ingredient slug (or prep_state) compiles to `failed` with proposed-slug rows persisted; re-compile with a different unknown slug replaces them.
- [x] Conversion v1: ingredient with `original_unit='g'` gets `qty_g` set and others null; ingredient with `original_unit='cup'` gets all metric fields null and `canonical_unit` = ingredient's `default_unit`.

### Cross-PRD wiring

- [x] PRD-117 cross-link landed (cycle detection is invoked between resolve and materialise).
- [x] PRD-107's `recipe_versions.compile_status`, `compile_error`, `compiled_at` columns are written exclusively by this PRD's compile function.

## Out of Scope

- Recipe-graph cycle detection — **PRD-117**.
- The Conversion Table (unit normalisation for `cup → ml`, "1 medium onion = 150g", etc.) — Epic 01 PRD. V1 compile only handles trivial g/ml/count carry-over.
- Compile triggering (when does compile run?) — service callers in PRD-107 (`createNewVersion`) and Epic 01 (save-DSL endpoint) are responsible.
- Renderer that turns `body_md` and `body_resolved_json` into a styled view — Epic 01 PRD.
- Editor annotations for compile errors — Epic 01 PRD; this PRD just provides the structured `compile_error` JSON.
- Promoting proposed slugs into real `slug_registry` entries — Epic 03 (review queue).
- Performance optimisation for bulk recompile (e.g. after a global ingredient rename) — deferred.
