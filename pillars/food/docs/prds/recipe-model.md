# Recipe & Version Model

Status: **Done** — schema, service layer, and lifecycle invariants are live in the food pillar. The only unbuilt remainder is a tag write/management surface (no endpoint or service creates/edits `recipe_tags` yet — tags are read-only); see [ideas/recipe-tag-management.md](../ideas/recipe-tag-management.md).

Every recipe is a stable identity (`recipes`) with one or more content snapshots (`recipe_versions`). A version stores the canonical DSL body plus the metadata that doesn't depend on parsing (title, servings, times, yield declaration, source). Tags are a free-form pivot on the recipe (stable identity), not the version.

This is the schema-and-lifecycle layer. The DSL grammar, parser, slug resolver, materialised `recipe_lines` / `recipe_steps` tables, cycle detection, and compile function read and write the columns declared here but define their own semantics — see the DSL/compile PRDs. This PRD owns the columns; it does not own parsing or compile logic beyond column meaning.

Schema lives at `pillars/food/src/db/schema/food-recipes.ts`; services at `pillars/food/src/db/services/recipes.ts` (recipe-level CRUD) and `pillars/food/src/db/services/recipe-versions.ts` (version lifecycle). The recipe CRUD/lifecycle REST endpoints that read and write these tables are declared in the food contract `pillars/food/src/contract/rest-recipes.ts`; the ts-rest handlers are wired in `pillars/food/src/api/rest/recipes-handlers.ts` and delegate to the logic modules under `pillars/food/src/api/modules/recipes/`.

## Data Model

### `recipes` — stable identity

```sql
CREATE TABLE recipes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
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

- `slug` participates in the global `slug_registry` (food ingredient/prep-state model) — recipe slugs share one namespace with ingredient and prep_state slugs so a DSL reference like `@smash-patty` is unambiguous.
- `current_version_id` is nullable: it points at the version users see by default, null while the recipe has only `draft` versions and has never been promoted.
- `hero_image_path` is one image per recipe regardless of version (image churn doesn't justify a new version). Relative to the configured recipes image dir; the file storage layout and upload pipeline are owned elsewhere — this is just the column.
- `archived_at` is a soft delete on the recipe as a whole; rows persist for cook-history continuity.
- `recipe_type` is a soft enum for UX filtering only — no structural enforcement. The list above is the current vocabulary; extensions add CHECK values via migration.

### `recipe_versions` — content snapshot

```sql
CREATE TABLE recipe_versions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
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
  source_id            INTEGER,        -- FK to ingest_sources(id), added by the ingest migration
  compile_status       TEXT NOT NULL DEFAULT 'uncompiled'
                         CHECK (compile_status IN ('uncompiled','compiled','failed')),
  compile_error        TEXT,
  compiled_at          TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX uq_recipe_versions_recipe_no  ON recipe_versions(recipe_id, version_no);
CREATE INDEX        idx_recipe_versions_recipe    ON recipe_versions(recipe_id);
CREATE INDEX        idx_recipe_versions_status    ON recipe_versions(status);
CREATE INDEX        idx_recipe_versions_compile   ON recipe_versions(compile_status);
CREATE UNIQUE INDEX uq_recipe_versions_one_current
  ON recipe_versions(recipe_id) WHERE status = 'current';
```

- **`body_dsl` is canonical.** `title`, `summary`, `servings`, and times are duplicated from the DSL `@recipe(...)` header for fast list queries that don't want to re-parse. Drift is reconciled at compile: the columns are overwritten from the parsed header. The DSL wins. Direct UI edits to these columns are not supported — edit the DSL, save, recompile.
- `yield_*` columns are populated from the DSL `@yield(...)` call at compile; NULL until compile succeeds. A yield can carry a variant and a prep_state (e.g. `@yield(flank:braised:shredded, 500:g)`) so different cooks of the same base ingredient produce structurally distinct batches; both are nullable.
- **Multiple recipes may yield the same ingredient** — no UNIQUE on `yield_ingredient_id`. Pantry queries group batches by `(variant_id, prep_state_id)` regardless of producing recipe; cook-history follows `batches.source_id → recipe_runs.recipe_version_id` for provenance.
- `source_id` references `ingest_sources(id)` (the FK is wired by the ingest migration to avoid a forward declaration in this schema file); null for manually-authored recipes.
- `compile_status` / `compile_error` / `compiled_at` track technical readiness — written by the compile step, declared here: `uncompiled` (saved, never processed), `compiled` (parser + resolver + materialisation succeeded; `recipe_lines` / `recipe_steps` exist), `failed` (last attempt errored; `compile_error` carries a structured error string).

### `recipe_tags` — free-form tags

```sql
CREATE TABLE recipe_tags (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id),
  tag        TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
CREATE INDEX idx_recipe_tags_tag ON recipe_tags(tag COLLATE NOCASE);
```

Not in `slug_registry` (tags are high-churn, not DSL-referenceable). Tags belong to the recipe (stable identity), not the version — renaming or adding a tag doesn't bump the version. Storage is case-preserved; the `COLLATE NOCASE` index makes lookups case-insensitive.

## Service Layer

Recipe-level (`services/recipes.ts`) and version-lifecycle (`services/recipe-versions.ts`) functions take a `FoodDb` handle and run multi-table writes inside a single `db.transaction(...)`:

- `createRecipe` — writes `recipes`, the matching `slug_registry(slug, kind='recipe', target_id)` row, and the first `draft` version (`version_no=1`, `compile_status='uncompiled'`) atomically. A recipe with no version is degenerate, so the first version is created in the same transaction. Slug collision with any existing ingredient/prep_state/recipe slug raises `SlugAlreadyRegisteredError` (carrying the colliding `kind`).
- `renameRecipeSlug` — updates the `recipes.slug` and `slug_registry.slug` rows atomically; rolls back on collision.
- `deleteRecipe` (rare — `archiveRecipe` is the normal path) — removes recipe-scoped substitutions, its versions, the recipe, and the `slug_registry` row.
- `archiveRecipe` — sets `archived_at = now()`; does NOT remove the `slug_registry` row, so historic DSL references in archived recipes still resolve.
- `createNewVersion` — computes `version_no = max(version_no) + 1` inside the transaction and inserts a `draft` with `compile_status='uncompiled'`. Concurrent creates rely on `uq_recipe_versions_recipe_no` to fail loudly; the caller retries with the next number.
- `updateDraftVersion` — edits a draft's content (title/summary/body_dsl/servings/times). Throws `CannotEditPublishedVersion` on a `current` or `archived` row — published versions are immutable except for `status`.
- `archiveVersion` — sets a version's `status='archived'`.
- `promoteVersion` — atomic three-step: archive any previously-`current` version for the recipe, set the target to `current`, update `recipes.current_version_id`. Returns a discriminated `PromoteVersionResult`: `{ ok: true, row }` on success, or `{ ok: false, reason: 'ConcurrentPromotion', recipeId }` when the partial UNIQUE fires because another promotion won the race. Refuses a version whose `compile_status` is not `'compiled'` (throws `CannotPromoteUncompiledVersion`). Re-promoting an already-current version is idempotent. Accepts either a top-level `FoodDb` or a transactional handle so composing flows (e.g. inbox approve) can run it in a SAVEPOINT.

## REST Surface (recipe CRUD/lifecycle)

Served under the food contract; these endpoints read and write the tables above. Recipe content is supplied as DSL and compiled server-side — there is no endpoint that edits the denormalised header columns directly.

| Method | Path                                          | Purpose                                                                               |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/recipes/search`                             | List recipes — filter by search/type/tags/archived/draft-only, cursor-paginated.      |
| POST   | `/recipes`                                    | Create a recipe from a DSL body; returns slug, recipe id, version id, compile result. |
| GET    | `/recipes/:slug`                              | Get a recipe version assembled for rendering (optional `versionNo`).                  |
| GET    | `/recipes/:slug/drafts`                       | List a recipe's draft versions.                                                       |
| POST   | `/recipes/:slug/drafts`                       | Fork a new draft from the current version.                                            |
| POST   | `/recipes/:slug/archive`                      | Archive a recipe.                                                                     |
| PATCH  | `/recipes/versions/:versionId`                | Save + recompile a draft's DSL.                                                       |
| POST   | `/recipes/versions/:versionId/promote`        | Promote a compiled draft to current.                                                  |
| POST   | `/recipes/versions/:versionId/archive`        | Archive a version.                                                                    |
| POST   | `/recipes/versions/:versionId/restore`        | Restore an archived/published version as a new draft.                                 |
| GET    | `/recipes/versions/:versionId/proposed-slugs` | List slugs the draft's compile proposed for creation.                                 |

Tags are exposed read-only on this surface: `/recipes/search` accepts a `tags` filter and the rendering payload returns a recipe's tags. There is no mutation that creates or edits `recipe_tags`.

## Business Rules

### Version transitions

```
draft   ──promote──►    current
current ──superseded─►  archived   (only when another version is promoted)
draft   ──reject────►   archived
```

- A version cannot be promoted to `current` unless `compile_status='compiled'` — enforced in `promoteVersion`, not at the DB layer.
- At most one `current` version per recipe — enforced by the partial UNIQUE `uq_recipe_versions_one_current ... WHERE status='current'`.
- `recipes.current_version_id` and the `status='current'` row must agree; promotion updates both in one transaction.
- Promoting a new version archives the previously-current one atomically — there is never a window where a recipe has zero current versions.

### Header / DSL reconciliation

Compile parses `@recipe(...)` and overwrites `title`, `summary`, `servings`, `prep_minutes`, `cook_minutes`, and `recipe_type` (when present), and writes the `yield_*` columns from `@yield(...)`. The columns are an index; the DSL grammar is the source of truth.

## Edge Cases

| Case                                                              | Behaviour                                                                                                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Promote a draft whose `compile_status` is `failed`/`uncompiled`   | `CannotPromoteUncompiledVersion`. Fix the DSL and recompile first.                                                                                                           |
| Edit `body_dsl` on a `current`/`archived` version                 | `CannotEditPublishedVersion` — create a new draft, promote when ready.                                                                                                       |
| Create a recipe whose slug collides with an ingredient slug       | `SlugAlreadyRegisteredError` carrying `kind='ingredient'`.                                                                                                                   |
| Delete an ingredient that is a version's `yield_ingredient_id`    | FK rejection — archive the recipe first.                                                                                                                                     |
| Two concurrent `createNewVersion` on one recipe                   | `uq_recipe_versions_recipe_no` rejects the second; caller retries at `version_no + 1`.                                                                                       |
| Two concurrent `promoteVersion` on different drafts of one recipe | Partial UNIQUE rejects the loser; `promoteVersion` returns `{ ok: false, reason: 'ConcurrentPromotion' }` and the whole transaction (including the archive step) rolls back. |
| Archived recipe later referenced from a DSL `@ingredient(...)`    | Slug still resolves (archive doesn't drop the `slug_registry` row); UI surfaces an "archived" warning on the consuming recipe.                                               |
| Recipe edited but never compiled (`uncompiled`)                   | Allowed in `draft`; planner/solver ignore it. The promotion gate enforces compile success.                                                                                   |

## Acceptance Criteria

### Schema

- [x] `food-recipes.ts` declares `recipes`, `recipe_versions` (including `yield_variant_id` and `yield_prep_state_id`), and `recipe_tags`; the migration applies them with the CHECK constraints on `recipe_type`/`status`/`compile_status`, `COLLATE NOCASE` on `idx_recipe_tags_tag`, and the partial UNIQUE `uq_recipe_versions_one_current ... WHERE status='current'`.
- [x] The partial UNIQUE is verified by a test that reads its `WHERE` clause back out of `sqlite_master`.
- [x] Row-select Zod schemas for all three tables are generated.

### Service layer & invariants (each covered by a Vitest case)

- [x] `createRecipe` writes `recipes` + `slug_registry` + first draft (`version_no=1`, `draft`, `uncompiled`) in one transaction.
- [x] Creating a recipe whose slug exists as an ingredient slug throws `SlugAlreadyRegisteredError` with `kind='ingredient'`.
- [x] `createNewVersion` computes the next `version_no` (`max + 1`); two sequential calls land on distinct numbers.
- [x] `promoteVersion` on an `uncompiled`/`failed` version throws `CannotPromoteUncompiledVersion`.
- [x] `promoteVersion` archives the previously-current version atomically; final state shows exactly one current and a matching `recipes.current_version_id`.
- [x] `promoteVersion` returns `{ ok: true, row }` on the happy path; the partial UNIQUE rolls the archive step back when the update-to-current trips a constraint (no recipe is ever left with zero currents).
- [x] Re-promoting an already-current version is idempotent.
- [x] The partial UNIQUE rejects a raw SQL UPDATE that tries to create two currents.
- [x] `updateDraftVersion` on a `current`/`archived` version throws `CannotEditPublishedVersion`; updates a draft otherwise.
- [x] Deleting an ingredient referenced as a `yield_ingredient_id` fails with an FK violation.
- [x] Archiving a recipe leaves its `slug_registry` row intact; `deleteRecipe` removes it; `renameRecipeSlug` updates both tables atomically and rolls back on collision.
- [x] `recipe_tags` PK rejects duplicate `(recipe_id, tag)`; tags store case-preserved and are looked up case-insensitively via the NOCASE index.
- [x] A raw INSERT into `recipes` that bypasses the service does not populate `slug_registry` (guards against direct writes).

### REST

- [x] Recipe create/list/render/draft-fork/save/promote/archive/restore endpoints are all declared in the food contract with handlers wired to the live db; the create→list→render→draft→save→archive lifecycle (plus not-found / bad-DSL error mapping) is exercised end-to-end against the live schema, and the promote/restore lifecycle is covered at the service layer. Recipes are authored as DSL and compiled server-side.

## Deferred / Out of Scope

- Tag write & management surface (create/edit/merge `recipe_tags`, dedup of near-duplicate tags like `vegan` vs `plant-based`) — not built; see [ideas/recipe-tag-management.md](../ideas/recipe-tag-management.md).
- DSL grammar, parsing, slug resolution, `recipe_lines` / `recipe_steps` materialisation, compile function, and cycle detection — owned by the DSL/compile PRDs.
- Hero image file storage layout, upload pipeline, thumbnailing — storage-epic PRD; this PRD only declares the path column.
- Direct edits to header columns bypassing the DSL — disallowed by design.
- Bulk recipe import, cook events, batches, planning — separate epics.
