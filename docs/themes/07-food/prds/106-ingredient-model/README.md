# PRD-106: Ingredient & Variant Model

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the canonical ingredient hierarchy, the variant catalogue (presentations of an ingredient: fresh vs canned vs frozen), the prep_state catalogue (orthogonal cut/process modifiers), and the alias table that lets the ingest pipeline resolve "spring onion" to canonical "scallion". Every other food schema PRD references these tables; nothing else in the theme can ship until this lands.

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
  slug            TEXT NOT NULL UNIQUE,
  default_unit    TEXT NOT NULL CHECK (default_unit IN ('g','ml','count')),
  package_size_g  REAL,
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_variants_ingredient ON ingredient_variants(ingredient_id);
CREATE INDEX idx_variants_name       ON ingredient_variants(name COLLATE NOCASE);
```

A _variant_ is a presentation of an ingredient: `fresh-cob-corn`, `canned-corn-in-brine`, `frozen-corn-kernels`. Recipe lines may reference either an ingredient (any variant acceptable) or a specific variant. `package_size_g` is informational for shopping list rounding (deferred to Epic 04+).

### `prep_states`

```sql
CREATE TABLE prep_states (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);
```

A small enumeration of trivial knife/process modifiers applied at the recipe-line level (PRD-107): `whole`, `diced`, `sliced`, `chopped`, `shredded`, `minced`, `julienned`, `grated`, `crushed`, `zested`, `juiced`, `melted`, `softened`. Anything substantive (caramelised onions, roasted chicken, demi-glace) is a _recipe_ with its own yield ingredient — not a prep_state. The line: it's a recipe if the output is ever stored as a batch, OR heat/fermentation is applied, OR >1 input is involved. Otherwise it's a prep_state.

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

| Case                                                                              | Behaviour                                                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Two ingredients with the same name (e.g. cooking salt vs bath salt)               | Slugs differ (`salt-cooking`, `salt-bath`). Lookups by name return both; UI disambiguates.                      |
| Variant name collides with another variant of a different ingredient              | Allowed. Slugs are globally unique; names are not.                                                              |
| Alias collides with another ingredient's canonical name (e.g. `rocket` ↔ verb)    | Allowed. Lookup returns all matches; UI resolves during the ingest review flow (Epic 03).                       |
| Insert with `parent_id` pointing to a non-existent ingredient                     | FK rejection.                                                                                                   |
| Insert with `variant.ingredient_id` referring to a deleted ingredient             | FK rejection. Variants must be deleted before their parent ingredient.                                          |
| Alias with `source='ingest'` survives after ingest rollback                       | Alias persists. Orphan-alias cleanup is a separate concern (deferred to Epic 03).                               |
| Adding a 4th hierarchy level (e.g. nightshade → tomato → roma → san-marzano-roma) | Reject with `IngredientHierarchyDepthExceeded`. Workaround: make `san-marzano-roma` a variant of `roma-tomato`. |
| Empty `parent_id` chain                                                           | Treated as a root node (depth = 1).                                                                             |
| Density column for a count-default ingredient (e.g. `egg`)                        | Allowed but typically null. Conversion code must handle null gracefully and fall through to `qty_count`.        |

## Acceptance Criteria

Inline per theme protocol — see the `Doc protocol` row in [theme key decisions](../../README.md#key-decisions).

### Schema

- [ ] Drizzle schema in `packages/app-food/src/db/schema.ts` defines `ingredients`, `ingredient_variants`, `prep_states`, `ingredient_aliases` with the columns, types, defaults, and constraints above.
- [ ] Migration generated under `apps/pops-api/drizzle/` and applied cleanly to a fresh DB.
- [ ] `packages/db-types` regenerated; exports types for all four tables.
- [ ] Indexes from the SQL above exist after migration (verify via `PRAGMA index_list`).

### Invariants (each verified by a Vitest case)

- [ ] Inserting an ingredient with `parent_id` forming a cycle throws `IngredientCycleError`.
- [ ] Inserting at depth 4 throws `IngredientHierarchyDepthExceeded`.
- [ ] Inserting an alias with both `ingredient_id` and `variant_id` set fails with a CHECK violation.
- [ ] Inserting an alias with neither set fails with a CHECK violation.
- [ ] Inserting an alias that duplicates `(alias, ingredient_id, variant_id)` fails with a UNIQUE violation.
- [ ] Deleting an ingredient with extant variants fails with an FK violation.
- [ ] Deleting an ingredient with extant aliases fails with an FK violation.
- [ ] Inserting an ingredient with a non-kebab-case slug throws `InvalidSlugError`.
- [ ] Inserting a variant whose `ingredient_id` does not exist fails with an FK violation.

### Tests

- [ ] Vitest integration suite at `packages/app-food/src/db/__tests__/ingredient-model.test.ts` exercises each invariant against an in-memory SQLite seeded by the migration.
- [ ] Suite runs via `pnpm test` in `packages/app-food`; does not require Redis, the API process, or any external service.
- [ ] Tests included in the default `mise test` target.

### Documentation

- [ ] PRD-107 cross-link landed in this PRD's "Out of Scope" section (recipe-line FK target).
- [ ] No backward-compat shims for older shapes — this is a greenfield table set.

## Out of Scope

- Recipe lines referencing these tables — defined in **PRD-107**.
- Substitution edges between ingredients/variants — defined in **PRD-109**.
- Unit conversion table (cup→ml, "1 medium onion = 150 g") — deferred to an Epic 01 PRD once the recipe-line editor consumes it.
- Tag taxonomy for ingredients (`store-section:produce`, `aisle:dairy`) — deferred to Epic 07 (pantry-aware shopping).
- Any UI for managing ingredients — Epic 01 PRDs.
- Bulk import of common-ingredient datasets (USDA, Open Food Facts) — deferred. Seed data (PRD-113) is hand-curated and small.
- Soft delete / archival state — not modelled until a concrete need surfaces.
