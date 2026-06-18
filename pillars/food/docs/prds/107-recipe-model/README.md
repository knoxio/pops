# PRD-107: Recipe & Version Schema

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the recipe header and version schemas. Every recipe is a stable identity (`recipes`) with one or more snapshots of its content (`recipe_versions`); each version stores the canonical DSL body ([ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md)) plus the metadata that doesn't depend on parsing (title, servings, times, yield declaration, source). Tags are a free-form pivot on the recipe (not the version).

This PRD is schema-only. The DSL grammar, parser, resolver, materialised line/step tables, and cycle detection live in PRDs 114–117. PRD-107 owns the columns those PRDs read and write into, but does not define the parsing or compile semantics beyond column meaning.

## Data Model

### `recipes`

```sql
CREATE TABLE recipes (
  id                  INTEGER PRIMARY KEY,
  slug                TEXT NOT NULL UNIQUE,
  recipe_type         TEXT NOT NULL DEFAULT 'plate'
                        CHECK (recipe_type IN ('plate','component','technique','sauce','dressing','drink','condiment')),
  current_version_id  INTEGER REFERENCES recipe_versions(id),
  hero_image_path     TEXT,
  archived_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recipes_type ON recipes(recipe_type);
```

Stable identity. `slug` participates in the global `slug_registry` (PRD-106) — recipe slugs share a namespace with ingredient and prep_state slugs so `@smash-patty` in the DSL is unambiguous.

`current_version_id` is nullable. It points at the version users see by default; null while the recipe has only `draft` versions and has never been promoted.

`hero_image_path` is one image per recipe regardless of version — image churn doesn't justify a new version. Path is relative to `${FOOD_RECIPES_DIR}` (default `./data/food/recipes/`; filesystem layout and upload pipeline defined in PRD-124; this PRD just declares the column).

`archived_at` is a soft delete on the recipe as a whole; the rows persist for cook-history continuity.

`recipe_type` is a soft enum used for UX filtering only — no structural enforcement. The list above is the v1 vocabulary; extensions add CHECK values via a small migration.

### `recipe_versions`

```sql
CREATE TABLE recipe_versions (
  id                   INTEGER PRIMARY KEY,
  recipe_id            INTEGER NOT NULL REFERENCES recipes(id),
  version_no           INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','current','archived')),
  title                TEXT NOT NULL,
  summary              TEXT,
  body_dsl             TEXT NOT NULL,
  yield_ingredient_id  INTEGER REFERENCES ingredients(id),
  yield_variant_id     INTEGER REFERENCES ingredient_variants(id),
  yield_prep_state_id  INTEGER REFERENCES prep_states(id),
  yield_qty            REAL,
  yield_unit           TEXT,
  servings             INTEGER,
  prep_minutes         INTEGER,
  cook_minutes         INTEGER,
  source_id            INTEGER REFERENCES ingest_sources(id),
  compile_status       TEXT NOT NULL DEFAULT 'uncompiled'
                         CHECK (compile_status IN ('uncompiled','compiled','failed')),
  compile_error        TEXT,
  compiled_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uq_recipe_versions_recipe_no ON recipe_versions(recipe_id, version_no);
CREATE INDEX idx_recipe_versions_recipe        ON recipe_versions(recipe_id);
CREATE INDEX idx_recipe_versions_status        ON recipe_versions(status);
CREATE INDEX idx_recipe_versions_compile       ON recipe_versions(compile_status);
```

A snapshot of recipe content. New edit → new row with `version_no = max(version_no) + 1`. Old rows are immutable except for `status` transitions.

**`body_dsl` is the canonical content.** Everything else on this row is either header metadata or derived from the DSL during compile (PRDs 115–116). `title`, `servings`, and times are duplicated from the `@recipe(...)` header in the DSL for fast list queries that don't want to re-parse. Drift between header columns and the DSL header is reconciled at compile time: the columns are overwritten from the parsed `@recipe` call. The DSL wins.

`yield_*` columns are populated from the `@yield(...)` call at compile. Until compile succeeds they are NULL. `yield_ingredient_id` FKs into `ingredients` (PRD-106). Yields can carry a variant and a prep_state (e.g. `@yield(flank:braised:shredded, 500:g)`) — `yield_variant_id` and `yield_prep_state_id` capture them so different cooks of "flank" can produce structurally distinct batches (braised-shredded vs raw-cubed). Both nullable: a recipe yielding raw canonical "flank" leaves both null.

**Multiple recipes can yield the same ingredient.** No UNIQUE constraint on `yield_ingredient_id` — three different `pao-de-queijo` recipes can all `@yield(pao-de-queijo, 12:count)`. Pantry queries group batches by `(variant_id, prep_state_id)` regardless of which recipe produced them; cook-history queries follow `batches.source_id → recipe_runs.recipe_version_id` to see which recipe made each specific batch.

**Auto-creation of yield ingredients.** If `@yield(new-slug, ...)` references a slug not in `slug_registry`, PRD-115's resolver flags it as a creation; PRD-116's compile creates the ingredient (via PRD-106's `createIngredient` service) before materialising. Same for new variants under existing ingredients. Authoring a recipe never requires pre-seeding its outputs.

`source_id` FKs into `ingest_sources` (PRD-110); null for manually-authored recipes.

`compile_status`, `compile_error`, and `compiled_at` track the technical readiness of the version. PRD-116 writes these; this PRD just declares the columns:

- `uncompiled` — version exists but has never been processed (e.g. just saved).
- `compiled` — parser + resolver + materialisation succeeded; `recipe_lines` and `recipe_steps` rows exist for this version.
- `failed` — most recent compile attempt errored. `compile_error` is a structured error string (format defined in PRD-116).

### `recipe_tags`

```sql
CREATE TABLE recipe_tags (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id),
  tag        TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
CREATE INDEX idx_recipe_tags_tag ON recipe_tags(tag COLLATE NOCASE);
```

Free-form tags. Not in `slug_registry` (tags are high-churn, not referenceable from the DSL). Tags belong to the _recipe_ (stable identity), not the version — renaming a tag or adding one doesn't bump the version.

A periodic tag-merge UI lives in a future PRD (deferred — see Risks in theme README). For now duplicates like `vegan` vs `plant-based` will accumulate; no schema-level dedup.

## Business Rules

### Slug registration

- `createRecipe(slug, ...)` writes `recipes` AND `slug_registry(slug, kind='recipe', target_id)` in one transaction. Collision with any existing slug (ingredient, prep_state, recipe) raises `SlugAlreadyRegisteredError`.
- `renameRecipeSlug(recipeId, newSlug)` updates both rows atomically.
- `deleteRecipe(recipeId)` (rare — `archive` is the normal path) removes the `slug_registry` row.
- Archiving (`archived_at = now()`) does NOT remove from `slug_registry` — the slug remains reserved so historic references in archived recipes still resolve.

### Version transitions

Allowed `status` transitions:

```
draft  ──promote──► current
current ──superseded─► archived   (only when another version is promoted to current)
draft  ──reject────► archived
```

Disallowed: anything else. Specifically:

- A version cannot be promoted to `current` unless `compile_status = 'compiled'`. Enforced in the promotion service (`promoteVersion(versionId)`), not at the DB layer.
- At most ONE version per recipe can have `status = 'current'` at any time. Enforced by a partial UNIQUE index:

  ```sql
  CREATE UNIQUE INDEX uq_recipe_versions_one_current
    ON recipe_versions(recipe_id) WHERE status = 'current';
  ```

- `recipes.current_version_id` and `recipe_versions.status='current'` must agree. Promotion updates both in one transaction.
- Promoting a new version archives the previously-current one atomically. There is never a state where a recipe has zero current versions briefly while one is becoming current.

### Version creation

- Creating a new version of an existing recipe: `version_no = (SELECT max(version_no) FROM recipe_versions WHERE recipe_id = ?) + 1`. Concurrent creates rely on the UNIQUE index to fail loudly; the calling service retries with the next number.
- The first version of a new recipe gets `version_no = 1`. It starts as `draft`. Promoting it to `current` sets `recipes.current_version_id`.

### Header / DSL reconciliation

When PRD-116's compile runs, it parses `@recipe(...)` from `body_dsl` and overwrites the `title`, `summary`, `servings`, `prep_minutes`, `cook_minutes`, `recipe_type` (if present in the `@recipe` call) columns; it also writes `yield_ingredient_id`, `yield_variant_id`, `yield_prep_state_id`, `yield_qty`, `yield_unit` from the `@yield(...)` call. Direct UI edits to these columns are NOT supported — edit the DSL, save, recompile. PRD-107 columns are an index; PRD-114 grammar is the source of truth.

## Edge Cases

| Case                                                                            | Behaviour                                                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Promoting a draft to current whose `compile_status='failed'`                    | Service throws `CannotPromoteUncompiledVersion`. Fix the DSL and recompile first.                                                         |
| Saving a `body_dsl` change to a `current` version                               | Forbidden. Create a new draft version; promote when ready. Service throws `CannotEditPublishedVersion`.                                   |
| Creating a recipe whose slug collides with an ingredient slug                   | `SlugAlreadyRegisteredError` with `kind='ingredient'` in the message.                                                                     |
| Deleting an ingredient that is the `yield_ingredient_id` of a recipe version    | FK rejection. Archive the recipe first if it's no longer wanted.                                                                          |
| Two concurrent calls to `createNewVersion(recipeId)`                            | First wins via UNIQUE(recipe_id, version_no); second retries with `version_no + 1`.                                                       |
| Concurrent calls to `promoteVersion` on two different drafts of the same recipe | Partial UNIQUE index on `status='current'` rejects the second; service surfaces a typed `ConcurrentPromotion` error.                      |
| Recipe with archived_at set is later referenced by `@ingredient(N, slug, ...)`  | Slug still resolves (archive doesn't drop from `slug_registry`). UI surfaces a "this recipe is archived" warning on the consuming recipe. |
| Recipe edited but never compiled (`compile_status='uncompiled'`)                | Allowed in `draft` state; planner/solver ignore the version. Promotion gate enforces compile success.                                     |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Drizzle schema extends `packages/db-types/src/schema/food.ts` (same convention deviation as PRD-106 — schemas live in db-types; `packages/app-food/src/db/schema.ts` re-exports) with `recipes`, `recipe_versions` (including `yield_variant_id` and `yield_prep_state_id`), `recipe_tags`.
- [x] Migration `apps/pops-api/src/db/drizzle-migrations/0059_useful_hiroim.sql` applies cleanly on top of PRD-106's `0058_high_sentinel.sql`. Hand-edited for the CHECK constraints on enum columns (recipe_type, status, compile_status), `COLLATE NOCASE` on `idx_recipe_tags_tag`, and the partial UNIQUE `uq_recipe_versions_one_current` (drizzle-kit can't express `WHERE status='current'`).
- [x] `packages/db-types` re-exports the three tables + `Row` / `Insert` types via the new `db-types/src/food.ts` sub-module (extracted to keep `db-types/src/index.ts` under the 200-line max-lines cap).
- [x] Indexes (including the partial UNIQUE on `status='current'`) verified by the `creates the partial UNIQUE on status="current"` test that queries `sqlite_master` for the `WHERE` clause.

### Service layer

- [x] `packages/app-food/src/db/services/recipes.ts` (recipe-level CRUD) + `services/recipe-versions.ts` (version lifecycle) — split to respect the 200-line max-lines cap. Exposes the typed methods `createRecipe`, `createNewVersion`, `promoteVersion`, `archiveVersion`, `archiveRecipe`, `renameRecipeSlug`, `deleteRecipe`, plus `updateDraftVersion` (used for body_dsl edits on draft rows; throws `CannotEditPublishedVersion` on non-drafts).
- [x] `createRecipe` and `deleteRecipe` maintain `slug_registry` atomically inside the same `db.transaction(...)` block (same pattern as PRD-106's ingredient service). `createRecipe` also creates the first draft version (version_no=1, status=draft, compile_status=uncompiled) atomically — a recipe with no version is degenerate.
- [x] `promoteVersion` writes `recipe_versions.status='current'`, archives the previously-current row (via `UPDATE WHERE recipeId AND status='current'`), and updates `recipes.current_version_id` in one transaction. SQLite partial-UNIQUE violations are caught and surfaced as `ConcurrentPromotion`.
- [x] `createNewVersion` computes the next `version_no` (`max + 1`) inside the transaction and creates a draft with `compile_status='uncompiled'`.

### Invariants (each verified by a Vitest case)

- [x] Creating a recipe whose slug exists as an ingredient slug throws `SlugAlreadyRegisteredError` with `kind='ingredient'`.
- [x] Creating a recipe successfully also creates the matching `slug_registry` row.
- [x] Promoting a version with `compile_status='uncompiled'` (or `failed`) throws `CannotPromoteUncompiledVersion`.
- [x] Promoting a draft when another current already exists archives that current in the same transaction; final state shows exactly one current.
- [x] The partial UNIQUE `uq_recipe_versions_one_current` rejects a manual SQL UPDATE that tries to create two currents. (Note: the in-memory test serialises calls; true concurrent `promoteVersion` race coverage is captured by the partial-unique enforcement test rather than a parallel-execution case.)
- [x] Two sequential `createNewVersion` calls on the same recipe land at distinct `version_no` (2 and 3). (The PRD's "concurrent retry" semantics are inherent to the partial-unique on `(recipe_id, version_no)`; explicit retry loop deferred to the consuming router code that has access to BullMQ job retry.)
- [x] `updateDraftVersion` on a `current` or `archived` version throws `CannotEditPublishedVersion`.
- [x] Deleting an ingredient that is the `yield_ingredient_id` of an existing version fails with an FK violation.
- [x] Archiving a recipe does NOT remove its `slug_registry` entry; the slug still resolves.
- [x] `recipe_tags` PK rejects duplicate `(recipe_id, tag)`.
- [x] Tag inserts are case-preserved on storage; lookups via `idx_recipe_tags_tag` (`COLLATE NOCASE`) are case-insensitive.

### Tests

- [x] Vitest integration suite at `packages/app-food/src/db/__tests__/recipe-model.test.ts` — 22 cases. Applies both 0058 + 0059 migrations to a fresh `:memory:` SQLite per test.
- [x] Suite runs via `pnpm test` in `packages/app-food`; no Redis, no API process. 54/54 tests pass (combined with the inherited PRD-106 + PRD-118 suites).

### Backend module wiring

- [x] `0059_useful_hiroim` appended to `apps/pops-api/src/modules/food/migrations.ts` `foodMigrationTags`. Owned row added to `apps/pops-api/src/db/migration-ownership.ts`. Contract guard `migration-ownership.test.ts` passes (4/4).

### Documentation

- [x] PRDs 114-117 already cross-link to this PRD's `body_dsl` source and `compile_status` semantics (Out of Scope section unchanged).

## Out of Scope

- DSL grammar and parsing — **PRD-114**.
- Slug-resolution semantics — **PRD-115**.
- `recipe_lines` and `recipe_steps` tables + compile function — **PRD-116**.
- Recipe ↔ yield ↔ recipe cycle detection — **PRD-117**.
- Hero image file storage layout, upload pipeline, thumbnailing — Epic 01 PRD (storage path is just a column here).
- Tag taxonomy curation / merge UI — deferred (see theme Risks).
- Direct edits to `title`/`servings`/etc bypassing the DSL — disallowed by design; no UI for it.
- `rejected` status (mentioned as future use) — not in v1; the `archived` state covers withdrawn drafts.
- Bulk recipe import — Epic 02 PRDs.
- Cook events, batches, planning — Epics 05.
