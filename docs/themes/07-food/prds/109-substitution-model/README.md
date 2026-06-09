# PRD-109: Substitution Model

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the substitution graph: directed edges between ingredients (or variants) declaring "A can stand in for B at ratio R, in these contexts". Powers two queries: at cook time ("out of butter, what works in this savoury recipe?") and at plan time ("what can I cook tonight given current batches + valid subs?"). Schema-only; query helpers and UI live in Epic 06.

## Design choice

Substitutions are **directed**. A bidirectional sub is two rows. This is more rows but simpler queries (no `OR`-explosion across direction) and makes asymmetric ratios first-class (butter→olive-oil at ratio 0.75 is a separate edge from olive-oil→butter at ratio 1.33).

A _per-recipe override_ is a row with `scope='recipe'` and `recipe_id` set; it shadows the global edge for that one recipe. The query resolver checks recipe-scoped rows first, then falls back to global.

## Data Model

### `substitutions`

```sql
CREATE TABLE substitutions (
  id                   INTEGER PRIMARY KEY,
  -- "from" side: exactly one of from_ingredient_id, from_variant_id
  from_ingredient_id   INTEGER REFERENCES ingredients(id),
  from_variant_id      INTEGER REFERENCES ingredient_variants(id),
  -- "to" side: exactly one of to_ingredient_id, to_variant_id
  to_ingredient_id     INTEGER REFERENCES ingredients(id),
  to_variant_id        INTEGER REFERENCES ingredient_variants(id),
  ratio                REAL NOT NULL DEFAULT 1.0 CHECK (ratio > 0),
  -- context: which cooking contexts this sub is valid in; JSON array of strings
  context_tags         TEXT NOT NULL DEFAULT '[]',
  -- scope: 'global' applies everywhere; 'recipe' overrides for one recipe
  scope                TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','recipe')),
  recipe_id            INTEGER REFERENCES recipes(id),
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  -- exactly one from-side
  CHECK ((from_ingredient_id IS NOT NULL) <> (from_variant_id IS NOT NULL)),
  -- exactly one to-side
  CHECK ((to_ingredient_id IS NOT NULL) <> (to_variant_id IS NOT NULL)),
  -- scope='recipe' iff recipe_id is set
  CHECK ((scope = 'recipe' AND recipe_id IS NOT NULL) OR (scope = 'global' AND recipe_id IS NULL))
);
CREATE INDEX idx_subs_from_ing   ON substitutions(from_ingredient_id) WHERE from_ingredient_id IS NOT NULL;
CREATE INDEX idx_subs_from_var   ON substitutions(from_variant_id)    WHERE from_variant_id    IS NOT NULL;
CREATE INDEX idx_subs_scope_recipe ON substitutions(scope, recipe_id) WHERE scope = 'recipe';
```

- **Ratio semantics**: `qty_of_substitute = qty_of_original × ratio`. So butter→olive-oil at 0.75 means "use 0.75 cups oil for every 1 cup butter". The query layer applies the ratio when presenting a sub.
- **Context tags**: free-form strings stored as JSON array. v1 vocabulary (recommended, not enforced): `savory`, `sweet`, `baking`, `frying`, `dressing`, `marinade`, `garnish`, `vegan`, `dairy-free`, `gluten-free`. A sub with empty `context_tags` applies in any context. Resolver filters by intersection.
- **Per-recipe override**: when both a `scope='recipe', recipe_id=X` row and a `scope='global'` row exist for the same `from`, the recipe-scoped row wins for recipe X. UI for managing per-recipe subs lives in Epic 06.

### Source-cardinality CHECKs

The CHECKs enforce "exactly one ingredient_id or variant_id per side". Same pattern as `ingredient_aliases` (PRD-106). The scope CHECK enforces that `recipe_id` is set iff `scope='recipe'`.

### Why not a junction table?

A junction-table model (one `sub_edge` row + one `sub_context` row per context tag) is more relational-pure but adds joins for every read. Context tags are a small, write-once list per edge; JSON column is fine and matches the engagement pattern (read in bulk, filter in app code or via `json_each`).

## Query patterns

The two queries Epic 06 will build against this:

### Cook-time: "subs for ingredient X in recipe R, context C"

```sql
-- Pseudocode-ish; actual Drizzle code in Epic 06
SELECT * FROM substitutions
WHERE (from_ingredient_id = :X OR from_variant_id IN (variants of X))
  AND (scope = 'global'
       OR (scope = 'recipe' AND recipe_id = :R))
  -- Recipe-scoped rows win: filter via service
  AND (context_tags = '[]' OR json_array_length(context_tags) = 0
       OR EXISTS (SELECT 1 FROM json_each(context_tags) WHERE value IN :C));
```

Service-layer logic merges global + recipe-scoped, with recipe-scoped overriding by `(from_ingredient_id, from_variant_id)` match.

### Plan-time: "recipes I can cook given current batches + subs"

A recursive resolution: for each candidate recipe, check each recipe line. A line is satisfiable if a batch exists for the canonical variant OR if a sub-edge exists to any variant that DOES have a batch. The substitutions graph is consulted as edges; the search depth is capped at 1 (we don't chain subs — A → B → C is not auto-resolved; the user explicitly picks one hop).

## Business Rules

- Substitutions are directed. Bidirectional subs = two rows; nothing in the schema groups them.
- Same (from, to, scope, recipe_id) tuple cannot be inserted twice. SQLite treats NULL as distinct inside compound UNIQUE constraints, and the XOR CHECKs guarantee exactly one of `from_ingredient_id` / `from_variant_id` (and same on the `to` side) is NULL on every row — so the naive four-column tuple lets duplicates slip in. The migration splits the constraint into **eight partial UNIQUE indexes**, one per `{from, to} × {ingredient, variant}` combination × `{global, recipe}` scope, e.g.:
  ```sql
  -- global scope — four indexes, one per from/to ingredient-vs-variant combo
  CREATE UNIQUE INDEX uq_subs_global_ing_ing ON substitutions(from_ingredient_id, to_ingredient_id)
    WHERE scope = 'global' AND from_variant_id IS NULL AND to_variant_id IS NULL;
  CREATE UNIQUE INDEX uq_subs_global_ing_var ON substitutions(from_ingredient_id, to_variant_id)
    WHERE scope = 'global' AND from_variant_id IS NULL AND to_ingredient_id IS NULL;
  -- ... uq_subs_global_var_ing, uq_subs_global_var_var
  -- recipe scope — same four shapes, plus recipe_id in the index, gated by scope = 'recipe'
  -- ... uq_subs_recipe_ing_ing through uq_subs_recipe_var_var
  ```
- Ratio is always positive. Zero or negative throws CHECK violation.
- Context tags are stored as a JSON array of strings. Service writes via `JSON.stringify`; reads use `json_each` or app-side parse.
- Self-substitution (`from = to`) is forbidden. Enforced at service layer (`CannotSubstituteSelf`).
- Per-recipe substitutions are deleted when the parent recipe is deleted (FK ON DELETE no action — service handles in transaction). Archived recipes' substitutions persist until the recipe is hard-deleted.

## Edge Cases

| Case                                                                       | Behaviour                                                                              |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Sub from ingredient `butter` to variant `olive-oil:extra-virgin`           | Allowed. Service layer is responsible for sensible UX (matched at variant precision)   |
| Sub with empty `context_tags`                                              | Applies in any context. Resolver treats `[]` as "wildcard".                            |
| Sub with `context_tags=['savory','baking']`                                | Applies when query context includes `savory` OR `baking` (OR, not AND).                |
| Two global subs for the same (from, to)                                    | UNIQUE rejects.                                                                        |
| Global sub PLUS recipe-scoped sub for same (from, to) in different recipes | Allowed. Resolver picks the recipe-scoped one for queries against that recipe.         |
| Recipe deletion with extant per-recipe subs                                | Service deletes the subs in the same transaction. Archive (soft) leaves them intact.   |
| Substitution from a recipe-yield ingredient                                | Allowed. "If you don't have homemade tomato salsa, sub canned salsa at 1.0 ratio."     |
| Bidirectional sub stored as one row by mistake                             | Schema doesn't catch it (no bidirectional flag); UI prompts to create the reverse row. |
| Context tag with a typo (`sourry` instead of `savory`)                     | Stored as-is. Taxonomy curation deferred to future PRD.                                |
| Sub against an archived ingredient                                         | Allowed. Resolver may filter archived ingredients in UI, but schema does not.          |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `substitutions` per the SQL above, plus the eight partial UNIQUE indexes that defeat SQLite's NULL-as-distinct UNIQUE rule (four per scope, one per from/to ingredient-vs-variant combination).
- [x] All CHECKs and FKs verified via PRAGMA.
- [x] `packages/db-types` regenerated.

### Invariants (each verified by a Vitest case)

- [x] Inserting a sub with both `from_ingredient_id` AND `from_variant_id` fails the CHECK.
- [x] Inserting a sub with neither side set on `from` or `to` fails.
- [x] Inserting a sub with `scope='recipe'` but no `recipe_id` fails.
- [x] Inserting a sub with `scope='global'` AND `recipe_id` set fails.
- [x] Inserting a sub with `ratio = 0` or negative fails.
- [x] Inserting two global subs for the same (from, to) pair fails the partial UNIQUE.
- [x] Inserting two recipe-scoped subs for the same (from, to, recipe_id) fails.
- [x] Inserting a global AND a recipe-scoped sub for the same (from, to) but different scope succeeds.
- [x] Service rejects self-substitution (`from = to`) with `CannotSubstituteSelf`.
- [x] Context tag JSON round-trips: insert `["savory","baking"]`, read back, get the same array.

### Tests

- [x] Vitest suite at `packages/app-food/src/db/__tests__/substitutions.test.ts` covers each invariant.
- [x] A small smoke test for `json_each` query against `context_tags` proves the filter pattern from "Query patterns" actually works.

## Out of Scope

- Substitution graph CRUD UI — Epic 06 PRD.
- Cook-time recommendation UI ("subs for this ingredient") — Epic 06 PRD.
- "What can I cook tonight" solver — Epic 06 PRD.
- Substitution chaining (A → B → C transitive) — explicitly excluded; users pick one-hop subs.
- Substitution-aware shopping-list math — Epic 07.
- Context tag canonical vocabulary / merge UI — deferred; v1 is freeform.
- Substitution suggestions from cook history / ML — deferred.
