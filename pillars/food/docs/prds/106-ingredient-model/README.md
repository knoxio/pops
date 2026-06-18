# PRD-106: Ingredient & Variant Model

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the canonical ingredient hierarchy, the variant catalogue (presentations of an ingredient: fresh vs canned vs frozen), the prep_state catalogue (orthogonal cut/process modifiers), the alias table that lets the ingest pipeline resolve "spring onion" to canonical "scallion", and the **slug registry** that enforces a single global namespace for entities referenceable from the recipe DSL ([ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md)). Every other food schema PRD references these tables; nothing else in the theme can ship until this lands.

This PRD is schema-only. No tRPC procedures, no UI — those live in Epic 01 PRDs. Direct Drizzle queries from server code are the contract for now.

## Data Model

### `ingredients`

```sql
CREATE TABLE ingredients (
  id               INTEGER PRIMARY KEY,
  parent_id        INTEGER REFERENCES ingredients(id),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  default_unit     TEXT NOT NULL CHECK (default_unit IN ('g','ml','count')),
  density_g_per_ml REAL,
  notes            TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ingredients_parent ON ingredients(parent_id);
CREATE INDEX idx_ingredients_name   ON ingredients(name COLLATE NOCASE);
```

Tree-shaped hierarchy via `parent_id`. Root nodes (e.g. `tomato`) have `parent_id IS NULL`. Specific cultivars (`roma-tomato`) reference a parent. Hierarchy depth is capped at **3** (`nightshade` → `tomato` → `roma-tomato`).

`density_g_per_ml` enables volume↔weight conversion when the recipe gives volume but the canonical metric is weight. Optional; null means no auto-conversion for that ingredient.

### `ingredient_variants`

```sql
CREATE TABLE ingredient_variants (
  id              INTEGER PRIMARY KEY,
  ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  default_unit    TEXT NOT NULL CHECK (default_unit IN ('g','ml','count')),
  package_size_g  REAL,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ingredient_id, slug)
);
CREATE INDEX idx_variants_ingredient ON ingredient_variants(ingredient_id);
CREATE INDEX idx_variants_name       ON ingredient_variants(name COLLATE NOCASE);
```

A _variant_ is a presentation of an ingredient: under `corn` you might have `fresh-cob`, `canned-brine`, `frozen-kernels`. Variant slugs are **scoped under their parent ingredient** — `raw` is a valid variant slug under both `banana` and `apple` because the resolver always knows the parent. Variants do NOT participate in the global slug registry; the DSL references them via the compact descriptor `ingredient-slug:variant-slug:prep-slug` (see [ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md)). `package_size_g` is informational for shopping list rounding (deferred to Epic 04+).

### `prep_states`

```sql
CREATE TABLE prep_states (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
```

A small enumeration of trivial knife/process modifiers applied at the recipe-line level (PRD-107): `whole`, `diced`, `sliced`, `chopped`, `shredded`, `minced`, `julienned`, `grated`, `crushed`, `zested`, `juiced`, `melted`, `softened`, `mashed`, `roughly-chopped` (15 total — matches PRD-113's seed). Anything substantive (caramelised onions, roasted chicken, demi-glace) is a _recipe_ with its own yield ingredient — not a prep_state. The line: it's a recipe if the output is ever stored as a batch, OR heat/fermentation is applied, OR >1 input is involved. Otherwise it's a prep_state.

### `ingredient_aliases`

```sql
CREATE TABLE ingredient_aliases (
  id            INTEGER PRIMARY KEY,
  ingredient_id INTEGER REFERENCES ingredients(id),
  variant_id    INTEGER REFERENCES ingredient_variants(id),
  alias         TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('user','llm','ingest')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((ingredient_id IS NOT NULL) <> (variant_id IS NOT NULL)),
  UNIQUE (alias, ingredient_id, variant_id)
);
CREATE INDEX idx_aliases_alias ON ingredient_aliases(alias COLLATE NOCASE);
```

The source-cardinality CHECK enforces "exactly one of ingredient_id / variant_id". `source` records origin: `user` (manually confirmed), `llm` (auto-proposed during ingest, awaiting promotion), `ingest` (parsed from JSON-LD or structured site data).

### `slug_registry`

```sql
CREATE TABLE slug_registry (
  slug        TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('ingredient','recipe','prep_state')),
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_slug_registry_kind_target ON slug_registry(kind, target_id);
```

A single global namespace for every entity that can be referenced by slug from the recipe DSL ([ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md)): ingredients, recipes (PRD-107), and prep_states. The `slug` column is the primary key — uniqueness across all three kinds is enforced by SQLite at the storage level. The DSL resolver looks up `@banana` or `@smash-patty` in this single table and disambiguates via the `kind` column.

Variants are deliberately **excluded** from the registry — they're scoped under their parent ingredient and referenced via the compact descriptor `ingredient:variant:prep`. Tags are also excluded (free-form, high-churn).

The registry is populated by the application layer on insert/delete of the parent rows:

- INSERT into `ingredients` → INSERT into `slug_registry(slug, kind='ingredient', target_id=ingredients.id)`.
- INSERT into `prep_states` → INSERT into `slug_registry(slug, kind='prep_state', target_id=prep_states.id)`.
- INSERT into `recipes` (PRD-107) → INSERT into `slug_registry(slug, kind='recipe', target_id=recipes.id)`.
- DELETE on any of the above → cascading DELETE from `slug_registry` for that row.

Implemented at the app layer (not SQL triggers) because: (a) it's testable with the existing Vitest setup; (b) it integrates with Drizzle's typed transactions; (c) the rename path (changing a slug) needs a coordinated update across two tables and is much cleaner as an explicit service method than a trigger.

A slug collision across kinds (e.g. trying to create a recipe with slug `banana` when an ingredient `banana` exists) fails with a typed `SlugAlreadyRegisteredError`, surfacing the existing kind in the error.

## API Surface

Out of scope for this PRD. Consumers use Drizzle queries directly. tRPC procedures will be defined in Epic 01.

## Business Rules

- **Tree, not DAG.** `parent_id` chain must not form a cycle. Walk parents at insert; reject with `IngredientCycleError` if the chain reaches the row being inserted.
- **Depth cap = 3.** Reject inserts that would create a 4th level with `IngredientHierarchyDepthExceeded`. Counted application-side at insert; not a CHECK because SQLite CHECKs can't recurse.
- **Slug shape.** Lowercase ASCII, kebab-case (`[a-z0-9]+(-[a-z0-9]+)*`). Enforced application-side. Slugs are globally unique within their table (ingredients and variants each have their own UNIQUE).
- **Names are not unique.** Two ingredients may legitimately share a name (e.g. `salt` for cooking vs `salt` for bath). Slugs disambiguate. UI shows the slug as a disambiguator when multiple matches exist.
- **Aliases are case-insensitive on lookup, case-preserved on storage.** Indexes use `COLLATE NOCASE`. `(alias, ingredient_id, variant_id)` UNIQUE prevents duplicate alias rows pointing at the same target.
- **Hard delete only.** Deleting an ingredient with extant variants is forbidden (no ON DELETE CASCADE — surface as an FK violation). Same for ingredient with extant aliases. Soft-delete is not modelled; revisit only if needed.
- **`default_unit` constrains, doesn't dictate.** Recipe lines override; pantry and shopping aggregation default to the ingredient's `default_unit` for display.

## Edge Cases

| Case                                                                              | Behaviour                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two ingredients with the same name (e.g. cooking salt vs bath salt)               | Slugs differ (`salt-cooking`, `salt-bath`). Lookups by name return both; UI disambiguates.                                                                        |
| Variant name collides with another variant of a different ingredient              | Allowed. Variant slugs are scoped per-ingredient; names are not unique either.                                                                                    |
| Variant slug collides with another variant slug under the same ingredient         | UNIQUE (ingredient_id, slug) rejects.                                                                                                                             |
| Recipe slug collides with an existing ingredient slug                             | `SlugAlreadyRegisteredError` from the slug_registry, surfacing the existing kind.                                                                                 |
| Renaming an ingredient slug                                                       | Service method updates `ingredients.slug` AND `slug_registry.slug` in one transaction. Aliases may need to be rebuilt; the rename method handles this explicitly. |
| Alias collides with another ingredient's canonical name (e.g. `rocket` ↔ verb)    | Allowed. Lookup returns all matches; UI resolves during the ingest review flow (Epic 03).                                                                         |
| Insert with `parent_id` pointing to a non-existent ingredient                     | FK rejection.                                                                                                                                                     |
| Insert with `variant.ingredient_id` referring to a deleted ingredient             | FK rejection. Variants must be deleted before their parent ingredient.                                                                                            |
| Alias with `source='ingest'` survives after ingest rollback                       | Alias persists. Orphan-alias cleanup is a separate concern (deferred to Epic 03).                                                                                 |
| Adding a 4th hierarchy level (e.g. nightshade → tomato → roma → san-marzano-roma) | Reject with `IngredientHierarchyDepthExceeded`. Workaround: make `san-marzano-roma` a variant of `roma-tomato`.                                                   |
| Empty `parent_id` chain                                                           | Treated as a root node (depth = 1).                                                                                                                               |
| Density column for a count-default ingredient (e.g. `egg`)                        | Allowed but typically null. Conversion code must handle null gracefully and fall through to `qty_count`.                                                          |

## Acceptance Criteria

Inline per theme protocol — see the `Doc protocol` row in [theme key decisions](../../README.md#key-decisions).

### Schema

- [x] Drizzle schema defines `ingredients`, `ingredient_variants`, `prep_states`, `ingredient_aliases`, `slug_registry` with the columns, types, defaults, and constraints above. Lives in `packages/db-types/src/schema/food.ts` (existing repo convention — `drizzle.config.ts` globs `packages/db-types/src/schema/*`); `packages/app-food/src/db/schema.ts` re-exports for service-side imports.
- [x] Migration generated as `apps/pops-api/src/db/drizzle-migrations/0058_high_sentinel.sql` and applied cleanly to a fresh SQLite (verified via the Vitest invariant suite). Hand-edited to add the enum `CHECK` constraints, `COLLATE NOCASE` on the name/alias indexes, and the partial-unique indexes (drizzle-kit's generator can't express either; see migration comments).
- [x] `packages/db-types` re-exports the five tables + `InferSelectModel` / `InferInsertModel` types (`IngredientRow`, `IngredientInsert`, `IngredientVariantRow`, etc.).
- [x] Indexes from the SQL above exist after migration (verified via the `creates the indexes from the PRD` test, which queries `sqlite_master`).

### Service layer (slug registry)

- [x] Service layer split across `packages/app-food/src/db/services/{ingredients,variants,prep-states,internal}.ts` (split to stay under the 200-line max-lines lint cap). Exposes the typed methods `createIngredient`, `updateIngredient`, `deleteIngredient`, `renameIngredientSlug`, `changeIngredientParent`, `createVariant`, `updateVariant`, `deleteVariant`, `createPrepState`, `deletePrepState`. Each service that touches `slug_registry` does so inside the same `db.transaction(...)` block as the parent row. Variants only manage `ingredient_variants` rows.
- [x] The `service guard — direct INSERT bypasses registry` describe-block asserts the registry stays empty after a raw INSERT into `ingredients` / `prep_states` — proves the test guards exist; the production path always uses the service.

### Invariants (each verified by a Vitest case)

- [x] Inserting an ingredient with `parent_id` forming a cycle throws `IngredientCycleError` (self-parent + transitive 3-node cycle covered).
- [x] Inserting at depth 4 throws `IngredientHierarchyDepthExceeded`.
- [x] Inserting an alias with both `ingredient_id` and `variant_id` set fails the `ck_aliases_xor_target` CHECK.
- [x] Inserting an alias with neither set fails the same CHECK.
- [x] Inserting a duplicate `(alias, ingredient_id)` under the same ingredient fails the `uq_aliases_alias_ingredient` partial-unique.
- [x] Deleting an ingredient with extant variants fails with an FK violation.
- [x] Deleting an ingredient with extant aliases fails with an FK violation.
- [x] Inserting an ingredient with a non-kebab-case slug throws `InvalidSlugError` (uppercase + leading hyphen + empty string covered).
- [x] Inserting a variant whose `ingredient_id` does not exist fails with an FK violation.
- [x] Inserting two variants with the same slug under the same ingredient fails the `uq_variants_ingredient_slug` UNIQUE.
- [x] Inserting two variants with the same slug under DIFFERENT ingredients succeeds.
- [x] `createIngredient(slug="banana")` twice throws `SlugAlreadyRegisteredError` with `kind="ingredient"`.
- [x] `createIngredient(slug="banana")` then `createPrepState(slug="banana")` throws `SlugAlreadyRegisteredError` with `kind="ingredient"`.
- [x] `renameIngredientSlug("banana", "musa")` updates both `ingredients.slug` and `slug_registry.slug` atomically; rollback on collision leaves the old row intact.
- [x] `deleteIngredient(id)` removes the row from `slug_registry` in the same transaction.

### Tests

- [x] Vitest integration suite at `packages/app-food/src/db/__tests__/ingredient-model.test.ts` exercises each invariant against an in-memory SQLite seeded by the migration. 24 cases.
- [x] Suite runs via `pnpm test` in `packages/app-food`; does not require Redis, the API process, or any external service.
- [x] Tests included in the default `mise test` target via the package's `pnpm test` script.

### Backend module wiring (added during impl)

- [x] `apps/pops-api/src/modules/food/` created with `index.ts` (stub `foodRouter = router({})` + `manifest: ModuleManifest<typeof foodRouter>` with `backend: { router: foodRouter, migrations: foodMigrations }`) and `migrations.ts` (`foodMigrationTags = ['0058_high_sentinel']`, `foodMigrations = drizzleMigrations(foodMigrationTags)`).
- [x] Food backend manifest registered in `apps/pops-api/src/modules/installed-modules.ts`; router mounted in `apps/pops-api/src/router.ts`'s `KNOWN_ROUTERS`.
- [x] Migration ownership registered in `apps/pops-api/src/db/migration-ownership.ts` (`'0058_high_sentinel': 'food'`); contract guard `migration-ownership.test.ts` extended to include the food manifest.

### Documentation

- [x] PRD-107 and PRD-116 cross-links remain in this PRD's Out of Scope section (recipe header refs ingredients in 107; recipe_lines FK target is in 116) — unchanged.
- [x] No backward-compat shims for older shapes — this is a greenfield table set.

## Out of Scope

- Recipe lines referencing these tables — defined in **PRD-107**.
- Recipe slug registration into `slug_registry` — handled in **PRD-107** (recipes table service inserts into the shared registry).
- DSL parser and resolver — defined in **PRD-107** per [ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md).
- Substitution edges between ingredients/variants — defined in **PRD-109**.
- Unit conversion table (cup→ml, "1 medium onion = 150 g") — deferred to an Epic 01 PRD once the recipe-line editor consumes it.
- Tag taxonomy for ingredients (`store-section:produce`, `aisle:dairy`) — deferred to Epic 07 (pantry-aware shopping).
- Any UI for managing ingredients — Epic 01 PRDs.
- Bulk import of common-ingredient datasets (USDA, Open Food Facts) — deferred. Seed data (PRD-113) is hand-curated and small.
- Soft delete / archival state — not modelled until a concrete need surfaces.
