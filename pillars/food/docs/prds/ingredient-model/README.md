# Ingredient & Variant Model

Status: Done — schema, service layer, full REST surface, and the invariant test suite are shipped.

The canonical ingredient hierarchy, the variant catalogue (presentations of an ingredient: fresh vs canned vs frozen), the `prep_states` vocabulary (orthogonal cut/process modifiers), the alias table that lets the ingest pipeline resolve "spring onion" to canonical "scallion", and the **slug registry** that enforces a single global namespace for entities referenceable from the recipe DSL. Recipe lines, batches, plans, substitutions and the shopping flow all hang off these tables.

## Data Model

All tables live in the food pillar's own SQLite (`pillars/food/src/db/schema/food-ingredients.ts`).

### `ingredients`

Columns: `id` PK, `parent_id` → `ingredients(id)` (nullable), `name`, `slug` (UNIQUE), `default_unit` ∈ {`g`,`ml`,`count`}, `density_g_per_ml` (nullable), `notes` (nullable), `created_at`.

Tree-shaped hierarchy via `parent_id` — root nodes (`tomato`) have `parent_id IS NULL`; cultivars (`roma-tomato`) reference a parent. Depth is capped at **3** (`nightshade` → `tomato` → `roma-tomato`), enforced app-side. `density_g_per_ml` enables volume↔weight conversion when a recipe gives volume but the canonical metric is weight; null means no auto-conversion. Indexes: `idx_ingredients_parent`, `idx_ingredients_name` (COLLATE NOCASE).

### `ingredient_variants`

Columns: `id` PK, `ingredient_id` → `ingredients(id)` (NOT NULL), `name`, `slug`, `default_unit` ∈ {`g`,`ml`,`count`}, `package_size_g` (nullable), `notes` (nullable), `default_shelf_life_days_fridge` (nullable), `default_shelf_life_days_freezer` (nullable), `created_at`. UNIQUE `(ingredient_id, slug)`. Indexes: `idx_variants_ingredient`, `idx_variants_name` (COLLATE NOCASE).

A variant is a presentation of an ingredient: under `corn` you might have `fresh-cob`, `canned-brine`, `frozen-kernels`. Variant slugs are **scoped under their parent ingredient** — `raw` is valid under both `banana` and `apple`. Variants do NOT participate in the global slug registry; the DSL references them via the compact descriptor `ingredient-slug:variant-slug:prep-slug`. `package_size_g` is informational for shopping-list rounding. The two `default_shelf_life_days_*` columns feed `expires_at` auto-population at cook time (null = unknown / shelf-stable).

### `prep_states`

Columns: `id` PK, `name` (UNIQUE), `slug` (UNIQUE).

A small enumeration of trivial knife/process modifiers applied at the recipe-line level: `whole`, `diced`, `sliced`, `chopped`, `shredded`, `minced`, `julienned`, `grated`, `crushed`, `zested`, `juiced`, `melted`, `softened`, `mashed`, `roughly-chopped` (15, matching the seed). Anything substantive (caramelised onions, roasted chicken, demi-glace) is a recipe with its own yield ingredient — not a prep_state. The line: it's a recipe if the output is ever stored as a batch, OR heat/fermentation is applied, OR >1 input is involved.

### `ingredient_aliases`

Columns: `id` PK, `ingredient_id` → `ingredients(id)` (nullable), `variant_id` → `ingredient_variants(id)` (nullable), `alias`, `source` ∈ {`user`,`llm`,`ingest`}, `created_at`. CHECK `ck_aliases_xor_target` enforces exactly one of `ingredient_id` / `variant_id`. UNIQUE `uq_aliases_alias_target` `(alias, ingredient_id, variant_id)` (partial-unique so NULL targets don't slip duplicates through). Index `idx_aliases_alias` (COLLATE NOCASE).

`source` records origin: `user` (manually confirmed), `llm` (auto-proposed during ingest, awaiting promotion), `ingest` (parsed from JSON-LD or structured site data).

### `slug_registry`

Columns: `slug` PK, `kind` ∈ {`ingredient`,`recipe`,`prep_state`}, `target_id`, `created_at`. Index `idx_slug_registry_kind_target` on `(kind, target_id)`.

A single global namespace for every entity referenceable by slug from the recipe DSL: ingredients, recipes, and prep_states. The `slug` PK enforces cross-kind uniqueness at the storage level; the resolver looks up `@banana` or `@smash-patty` and disambiguates via `kind`. Variants are deliberately excluded (scoped under their parent, referenced via `ingredient:variant:prep`); tags too (free-form, high-churn).

The registry is maintained by the service layer, not SQL triggers — testable, integrates with typed transactions, and the rename path (coordinated update across two tables) is cleaner as an explicit method:

- create ingredient → insert `slug_registry(kind='ingredient')` in the same transaction
- create prep_state → insert `slug_registry(kind='prep_state')`
- create recipe (owned by the recipes service) → insert `slug_registry(kind='recipe')`
- delete any of the above → cascading delete from `slug_registry` in the same transaction

A cross-kind slug collision (creating a recipe `banana` when ingredient `banana` exists) throws a typed `SlugAlreadyRegisteredError` surfacing the existing kind.

## REST API Surface

ts-rest (zod) contract under `pillars/food/src/contract/rest-{ingredients,variants,prep-states,aliases,slugs}.ts`, mounted into the pillar router and projected to OpenAPI.

Ingredients:

- `GET /ingredients?search&parentId` — list (filtered)
- `POST /ingredients` — create (201)
- `GET /ingredients/:idOrSlug` — get by numeric id OR slug, with variants
- `PATCH /ingredients/:id` — update name / default_unit / density / notes
- `POST /ingredients/rename` `{oldSlug,newSlug}` — atomic slug rename (updates registry)
- `POST /ingredients/:id/parent` `{newParentId}` — re-parent (cycle/depth guarded)
- `GET /ingredients/:id/blockers` — FK delete blockers (variants + aliases counts)
- `GET /ingredients/:id/recipe-refs` — recipes referencing this ingredient via compiled lines
- `DELETE /ingredients/:id` — soft-blocked: returns `{ok:false, blockers}` when variants/aliases remain, else `{ok:true}`

Variants: `POST /variants`, `PATCH /variants/:id`, `DELETE /variants/:id`.

Prep states: `GET /prep-states`, `POST /prep-states` (400 bad slug, 409 slug taken under any kind).

Aliases: `GET /aliases` (filter by search/source/target), `GET /aliases/with-targets` (joined target metadata), `POST /aliases`, `PATCH /aliases/:id` (rename text), `DELETE /aliases/:id`, `POST /aliases/merge` (re-point many aliases onto one target), `POST /aliases/bulk-approve` (flip `llm` → `user`).

Slugs: `GET /slugs/search?query&kinds&limit` — read-only substring search over the registry, optionally scoped by kind; powers slug-autocomplete.

Typed service errors map to HTTP: `InvalidSlugError` / `IngredientCycleError` / `IngredientHierarchyDepthExceeded` → 400; `SlugAlreadyRegisteredError` → 409; SQLite FK (ingredient/variant in use) → 409; unknown id on update/re-parent → 404.

## Business Rules

- **Tree, not DAG.** The `parent_id` chain must not cycle. A DFS walk at insert / re-parent rejects with `IngredientCycleError` (self-parent and transitive cycles both covered).
- **Depth cap = 3.** A 4th level is rejected with `IngredientHierarchyDepthExceeded`. Counted app-side; not a CHECK because SQLite CHECKs can't recurse.
- **Slug shape.** Lowercase ASCII kebab-case `[a-z0-9]+(-[a-z0-9]+)*`, enforced app-side via `assertValidSlug` → `InvalidSlugError`. Empty, leading/trailing/double hyphens, uppercase, non-ASCII all rejected.
- **Names are not unique.** Two ingredients may share a name (cooking `salt` vs bath `salt`); slugs disambiguate and the UI shows the slug when multiple matches exist.
- **Aliases case-insensitive on lookup, case-preserved on storage.** Indexes use COLLATE NOCASE; the partial-unique prevents duplicate alias rows pointing at the same target.
- **Hard delete only.** Deleting an ingredient with extant variants or aliases is forbidden (FK violation / blockers response). Soft-delete is not modelled.
- **`default_unit` constrains, doesn't dictate.** Recipe lines override; pantry and shopping aggregation default to the ingredient's `default_unit` for display.
- **Registry is service-owned.** A raw INSERT into `ingredients` / `prep_states` that bypasses the service leaves the registry empty — the production path always goes through the service, which writes both rows in one transaction.

## Edge Cases

| Case                                                                           | Behaviour                                                                                                                         |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Two ingredients share a name (cooking vs bath salt)                            | Slugs differ; lookups by name return both, UI disambiguates.                                                                      |
| Variant name collides across different ingredients                             | Allowed — variant slugs are per-ingredient, names aren't unique.                                                                  |
| Two variants with same slug under same ingredient                              | Rejected by `uq_variants_ingredient_slug`.                                                                                        |
| Two variants with same slug under different ingredients                        | Allowed.                                                                                                                          |
| Recipe slug collides with an existing ingredient slug                          | `SlugAlreadyRegisteredError`, surfacing the existing kind.                                                                        |
| Rename an ingredient slug                                                      | Service updates `ingredients.slug` AND `slug_registry.slug` in one transaction; collision rolls back, leaving the old row intact. |
| Alias collides with another ingredient's canonical name                        | Allowed; lookup returns all matches, resolved during ingest review.                                                               |
| `parent_id` / `variant.ingredient_id` pointing at a missing/deleted ingredient | FK rejection — variants must be deleted before their parent.                                                                      |
| Add a 4th hierarchy level                                                      | `IngredientHierarchyDepthExceeded`; workaround is to make the leaf a variant of the depth-3 node.                                 |
| Empty `parent_id` chain                                                        | Root node (depth 1).                                                                                                              |
| Density on a count-default ingredient (`egg`)                                  | Allowed but usually null; conversion handles null and falls through to count.                                                     |

## Acceptance Criteria

Schema

- [x] Drizzle schema defines `ingredients`, `ingredient_variants`, `prep_states`, `ingredient_aliases`, `slug_registry` with the columns, types, defaults, and constraints above, plus the variant `default_shelf_life_days_{fridge,freezer}` columns.
- [x] The enum CHECKs, COLLATE NOCASE name/alias indexes, and partial-unique alias index exist on a fresh SQLite (verified against `sqlite_master`).
- [x] Row + insert types (`IngredientRow`/`IngredientInsert`, `IngredientVariantRow`, `PrepStateRow`, `IngredientAliasRow`, `SlugRegistryRow`, …) are exported from the food db barrel.

Service layer (slug registry)

- [x] Typed methods `createIngredient`, `updateIngredient`, `deleteIngredient`, `renameIngredientSlug`, `changeIngredientParent`, `createVariant`, `updateVariant`, `deleteVariant`, `createPrepState`, `deletePrepState`, `listPrepStates`, `getPrepState`. Every method touching `slug_registry` does so inside the same `db.transaction(...)` as the parent row. Variants only manage `ingredient_variants`.
- [x] A test guard asserts the registry stays empty after a raw INSERT into `ingredients` / `prep_states`, proving the registry only fills via the service.

REST surface

- [x] Ingredients, variants, prep-states, aliases, and slugs sub-routers are defined, mounted into the pillar router, and projected to OpenAPI.
- [x] Service errors map to the documented status codes; delete is soft-blocked with a `blockers` payload.

Invariants (each a Vitest case)

- [x] Cycle (self-parent + transitive 3-node) throws `IngredientCycleError`.
- [x] Depth-4 insert throws `IngredientHierarchyDepthExceeded`.
- [x] Alias with both / neither of `ingredient_id`,`variant_id` fails `ck_aliases_xor_target`.
- [x] Duplicate `(alias, ingredient_id)` fails `uq_aliases_alias_target`.
- [x] Deleting an ingredient with extant variants / aliases fails with an FK violation.
- [x] Non-kebab slug (uppercase / leading hyphen / empty) throws `InvalidSlugError`.
- [x] Variant with a non-existent `ingredient_id` fails with an FK violation.
- [x] Two variants, same slug, same ingredient → `uq_variants_ingredient_slug`; same slug, different ingredients → succeeds.
- [x] `createIngredient(slug="banana")` twice → `SlugAlreadyRegisteredError` with `kind="ingredient"`.
- [x] `createIngredient("banana")` then `createPrepState("banana")` → `SlugAlreadyRegisteredError` with `kind="ingredient"`.
- [x] `renameIngredientSlug("banana","musa")` updates both rows atomically; collision rolls back.
- [x] `deleteIngredient(id)` removes the registry row in the same transaction.

Tests

- [x] `src/db/__tests__/ingredient-model.test.ts` exercises each invariant against an in-memory SQLite seeded by the schema (24 cases); REST behaviour covered by `src/api/__tests__/ingredients.test.ts`. No Redis, API process, or external service required.

## Out of Scope

- Recipe lines referencing these tables, and recipe slug registration — owned by the recipe model / DSL PRDs.
- DSL parser and resolver — per ADR-023.
- Substitution edges between ingredients/variants — substitution PRD.
- Unit-conversion table (cup→ml, "1 medium onion = 150 g") — conversions PRD.
- Tag taxonomy (`store-section:produce`, `aisle:dairy`) — the `ingredient_tags` table exists but its lookup/UI semantics are owned by the pantry/shopping tagging PRD.
- Bulk import of common-ingredient datasets (USDA, Open Food Facts) — seed data is hand-curated and small.
- Soft delete / archival state — not modelled until a concrete need surfaces.
