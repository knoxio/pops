# PRD-151: Store-Section Taxonomy

> Epic: [07 — Pantry-Aware Shopping](../../epics/07-pantry-aware-shopping.md)

## Overview

Introduce the `ingredient_tags` many-to-many table that PRD-106 explicitly deferred to Epic 07. Tags are free-form strings; the v1 convention is namespaced keys like `store-section:produce`, `diet:vegan`, `allergen:nuts`. This PRD ships the schema, the service layer, the tRPC routes, and a CRUD UI surface inside PRD-122's `/food/data` page (extends the Ingredients tab + adds a Tags vocabulary view). PRD-152's generator reads this taxonomy to sort the resulting shopping list by section.

After this PRD, the user can tag "tomato" as `store-section:produce`, "olive oil" as `store-section:pantry` + `store-section:condiments`, and "carrot" with no section tag (lands in "Other" downstream). The tagging UI surfaces existing tags via autocomplete to prevent fragmentation.

Future themes can layer additional tag namespaces (`diet:*`, `allergen:*`, `cuisine:*`) on the same table without further schema changes.

## Schema

```sql
CREATE TABLE ingredient_tags (
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  tag            TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ingredient_id, tag)
);
CREATE INDEX idx_ingredient_tags_tag       ON ingredient_tags(tag COLLATE NOCASE);
CREATE INDEX idx_ingredient_tags_namespace ON ingredient_tags(SUBSTR(tag, 1, INSTR(tag || ':', ':') - 1)) WHERE INSTR(tag, ':') > 0;
```

- PK on `(ingredient_id, tag)` prevents duplicates per ingredient.
- `idx_ingredient_tags_tag` collates `NOCASE` so the autocomplete lookup matches case-insensitively.
- `idx_ingredient_tags_namespace` is a partial expression index on the namespace prefix (e.g. `store-section`) for the `WHERE tag LIKE 'store-section:%'` query PRD-152 runs constantly. SQLite supports expression indexes since 3.9.
- `ON DELETE CASCADE` on `ingredient_id`: deleting an ingredient drops its tags. Tags never carry data the ingredient row doesn't.

### Why a separate table, not a JSON column

PRD-106 already considered options. A JSON column on `ingredients` would force a full-scan + `json_each` for every section-grouping query (PRD-152's generator does this per recipe-line × N recipes; could be hundreds of evaluations per generation). A many-to-many table is O(1) lookup per tag with the index. Single-user POPS isn't hammered by writes, so the write overhead is negligible.

### Tag value rules

- `tag` is stored verbatim — trimmed + lowercased at service-layer insert.
- Maximum length 64 chars (cosmetic; not enforced at schema layer).
- Allowed character set: `[a-z0-9:_-]`. Service-layer regex rejects anything else with `BadTagFormat`. The `:` is reserved as the namespace separator.
- Empty / whitespace-only tags rejected with `BadTagFormat`.
- The namespace (substring before the first `:`) is informational — there's no NS-level validation. Convention is the contract.

## v1 Tag Vocabulary

PRD-113's seed inserts the following `store-section:*` tags against the existing seed ingredients (extends PRD-113's seed manifest):

| Section         | Tag value                  | Example ingredients          |
| --------------- | -------------------------- | ---------------------------- |
| Produce         | `store-section:produce`    | tomato, onion, banana, kale  |
| Dairy           | `store-section:dairy`      | milk, butter, yogurt, eggs   |
| Meat            | `store-section:meat`       | chicken, beef, fish          |
| Pantry          | `store-section:pantry`     | flour, sugar, salt, rice     |
| Frozen          | `store-section:frozen`     | frozen-peas, ice-cream       |
| Bakery          | `store-section:bakery`     | bread, baguette, pita        |
| Condiments      | `store-section:condiments` | ketchup, mustard, sriracha   |
| Beverages       | `store-section:beverages`  | juice, soda, sparkling-water |
| Other (default) | (no tag)                   | anything uncategorised       |

The vocabulary is **suggested, not enforced**. Users can introduce custom sections (`store-section:farmers-market`, `store-section:butcher`) without a migration. The autocomplete picker (see CRUD below) lists every existing `store-section:*` value in the database so users discover what's already in use.

`eggs` in the Dairy column — yes, dairy isn't the right botanical home, but supermarket layouts typically pair them. Convention follows aisle layout, not biology.

## Service layer

```ts
// packages/app-food/src/db/services/ingredient-tags.ts
export async function addTagToIngredient(
  ingredientId: number,
  tag: string,
  db: SqliteDb
): Promise<{ ok: true } | { ok: false; reason: TagError }>;

export async function removeTagFromIngredient(
  ingredientId: number,
  tag: string,
  db: SqliteDb
): Promise<{ ok: true }>;

export async function listTagsForIngredient(
  ingredientId: number,
  db: SqliteDb
): Promise<{ tags: string[] }>;

export async function listIngredientsByTag(
  tag: string,
  db: SqliteDb
): Promise<{ ingredients: IngredientSummary[] }>;

export async function listDistinctTags(
  namespacePrefix: string | null, // null = all; 'store-section' = only store-section:* tags
  db: SqliteDb
): Promise<{ tags: TagDistinctRow[] }>;

export async function setTagsForIngredient(
  ingredientId: number,
  tags: string[], // FULL replacement set
  db: SqliteDb
): Promise<{ ok: true } | { ok: false; reason: TagError }>;

export type TagError =
  | 'BadTagFormat' // empty / whitespace / illegal chars
  | 'TagTooLong' // > 64 chars
  | 'IngredientNotFound';

export type TagDistinctRow = {
  tag: string;
  ingredientCount: number; // how many ingredients carry this tag
  firstSeenAt: string;
};

export type IngredientSummary = {
  id: number;
  slug: string;
  name: string;
};
```

`addTagToIngredient`: idempotent on the unique PK. Inserting the same `(ingredient_id, tag)` twice is a no-op.

`setTagsForIngredient`: replaces the entire tag set for the ingredient in one transaction. UI uses this for the multi-select tag editor.

`listDistinctTags`: powers the autocomplete picker. With `namespacePrefix='store-section'`, returns only namespaced section tags.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.ingredients.tags.list: query({
  input: { ingredientId: number },
  output: { tags: string[] },
});

food.ingredients.tags.set: mutation({
  input: { ingredientId: number, tags: string[] },
  output: { ok: true } | { ok: false, reason: TagError },
});

food.ingredients.tags.distinct: query({
  input: { namespacePrefix?: string },              // e.g. 'store-section' to filter
  output: { tags: TagDistinctRow[] },
});

food.ingredients.tags.findByTag: query({
  input: { tag: string },
  output: { ingredients: IngredientSummary[] },
});
```

All mutations transactional.

## CRUD UI — extends PRD-122

PRD-122 already has an Ingredients tab at `/food/data/ingredients`. This PRD extends it:

### Ingredient detail row

PRD-122's ingredient detail view (when the user expands a row) gains a **Tags** section:

- Chip list of current tags. Each chip has an `×` to remove.
- "+ Add tag" input with autocomplete:
  - Suggestions come from `food.ingredients.tags.distinct` (all tags) sorted by `ingredientCount DESC` then alphabetically.
  - User can type a custom tag; pressing Enter adds it.
  - Service rejects malformed tags with an inline error.
- A `Save` button commits changes via `food.ingredients.tags.set` (transactional replacement).

### Bulk tag editor — Ingredients tab list

A new bulk-action affordance in PRD-122's ingredient list:

- Select multiple ingredients via the existing checkbox column.
- Bulk action menu gains "Add tag…" / "Remove tag…" options.
- "Add tag" prompts for a tag (with autocomplete); applies to all selected ingredients.
- "Remove tag" lists tags present on any selected ingredient; applies removal to those that have it.

### New `/food/data/tags` sub-route

PRD-122's `/food/data` sidebar gains a 6th tab: **Tags vocabulary**. Read-only summary:

- Grouped by namespace (`store-section`, `diet`, `allergen`, `<no namespace>`).
- Each row: tag value, # of ingredients carrying it, first-seen timestamp, click → drill into the ingredients-by-tag list.
- Useful for spotting drift (`store-section:produce` vs `store-section:Produce`) before PRD-152 generates a list.

The Tags vocabulary tab is read-only in v1. Renaming / merging tags is deferred (see Out of Scope).

## Business Rules

- Tags are stored lowercased + trimmed; service normalises on insert.
- Tag values must match `^[a-z0-9_-]+(:[a-z0-9_-]+)*$` (allows multiple `:` separators for nested namespaces like `diet:strict-vegan`).
- An ingredient can carry any number of tags from any namespaces.
- PRD-152's generator reads only `store-section:*` tags from this table; other namespaces are no-ops for the shopping flow but live alongside.
- Deleting an ingredient cascades to drop its tags (FK ON DELETE CASCADE).
- Tag operations are individually transactional; bulk operations wrap in a single transaction.
- The autocomplete picker returns the top 50 most-used tags by default; full list available on scroll.
- Renaming a tag in v1 = bulk delete the old + bulk add the new across affected ingredients. No native rename mutation.

## Edge Cases

| Case                                                             | Behaviour                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| User adds `store-section:Produce` (capitalised)                  | Service lowercases to `store-section:produce`; stored once.                                                                           |
| User adds `store-section: produce` (space after colon)           | Service trims internal whitespace? No — only leading/trailing trim. The internal space fails the regex `[a-z0-9_-]+`. `BadTagFormat`. |
| User adds `store-section:café` (non-ASCII)                       | Fails the regex. `BadTagFormat`. UI suggests using ASCII slugs.                                                                       |
| Two ingredients tagged identically                               | Tags PK is `(ingredient_id, tag)` — different ingredients with same tag is normal.                                                    |
| Same ingredient tagged with the same tag twice                   | Idempotent; second insert is a no-op.                                                                                                 |
| Deleting an ingredient with 5 tags                               | `ON DELETE CASCADE` drops all 5 tag rows in one statement.                                                                            |
| Tag with 65 characters                                           | Service rejects with `TagTooLong`.                                                                                                    |
| Empty `tags: []` array passed to `set`                           | Replaces all tags with empty set (i.e. removes all). Allowed.                                                                         |
| Autocomplete picker with 500 distinct tags                       | Returns top 50 by `ingredientCount DESC`; user types to filter further.                                                               |
| Tag value `store-section` (no colon, no value)                   | Allowed by the regex (`[a-z0-9_-]+` matches "store-section"). Convention violation; UI may warn but won't reject.                     |
| Multiple `store-section:*` tags on one ingredient                | All stored. PRD-152's grouping picks one alphabetically (documented in PRD-152).                                                      |
| Concurrent edits to the same ingredient's tags from two browsers | Last write wins. Single-user; rare.                                                                                                   |
| User adds `store-section:produce` to an archived ingredient      | PRD-106 doesn't archive ingredients ([2026-06-08 decisions log]). N/A.                                                                |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [ ] Migration adds `ingredient_tags` table + the two indexes per the SQL above.
- [ ] `idx_ingredient_tags_namespace` (expression index) created and verified via `EXPLAIN QUERY PLAN` for `WHERE tag LIKE 'store-section:%'`.
- [ ] `ON DELETE CASCADE` verified by deleting a test ingredient and asserting its tags are gone.
- [ ] `packages/db-types` regenerated to export `ingredient_tags`.

### Service layer

- [ ] `addTagToIngredient` / `removeTagFromIngredient` / `listTagsForIngredient` / `listIngredientsByTag` / `listDistinctTags` / `setTagsForIngredient` all exposed.
- [ ] `setTagsForIngredient` is one transaction (DELETE existing + INSERT new).
- [ ] Tag normalisation: lowercase + trim on insert; regex validation per the spec.
- [ ] `BadTagFormat` / `TagTooLong` / `IngredientNotFound` returned on respective conditions.

### tRPC

- [ ] All four procedures exist in `apps/pops-api/src/modules/food/router.ts`.
- [ ] `distinct` accepts an optional `namespacePrefix` to filter (e.g. `'store-section'`).

### PRD-122 CRUD additions

- [ ] Ingredient detail view shows a Tags section with chip list + "+ Add tag" autocomplete.
- [ ] Autocomplete suggestions come from `food.ingredients.tags.distinct` sorted by usage.
- [ ] Bulk tag operations available from the Ingredients list (Add / Remove tag).
- [ ] New `/food/data/tags` sub-route renders the Tags vocabulary tab (read-only).

### PRD-113 seed extension

- [ ] PRD-113's `db:seed:food` mise task is extended to apply the v1 vocabulary table's tags to the 5 sample recipes' ingredients.
- [ ] After seed, `food.ingredients.tags.distinct({ namespacePrefix: 'store-section' })` returns at least 6 distinct values.

### Tests

- [ ] Vitest suite at `packages/app-food/src/db/__tests__/ingredient-tags.test.ts` covers:
  - Each invariant (PK uniqueness, CASCADE, regex validation, length cap).
  - `setTagsForIngredient` round-trip.
  - `listDistinctTags` with and without namespace filter.
- [ ] Vitest + RTL at `packages/app-food/src/pages/data/__tests__/IngredientTagsEditor.test.tsx` covers the chip editor + autocomplete + bulk operations.

## Out of Scope

- Tag renaming / merging UI — deferred. Users do bulk-remove + bulk-add manually in v1.
- Tag canonicalisation (auto-suggest "did you mean `store-section:produce`?" when user types `store-section:Produce`) — out of scope; lowercase-on-insert handles the most common case.
- Tag-based recipe search ("show me recipes whose ingredients are all `diet:vegan`") — out of scope; schema enables it but no UI in this epic.
- Per-variant tags (tag a `chicken-breast` differently from `chicken-thigh`) — out of scope. Variants inherit the parent ingredient's tags conceptually; downstream queries that need variant granularity look up the parent.
- Tag namespaces beyond convention — out of scope. No enforced schema on namespace values.
- Bulk import of tags from CSV — out of scope.
- Tag analytics ("how many of my recipes use store-section:produce ingredients") — deferred.
- LLM-assisted tagging ("tag every ingredient automatically") — out of scope.
- Plan-derived shopping generator using these tags — **PRD-152**.
- Cross-domain tag sharing (finance / inventory) — out of scope.

## Requires (cross-PRD dependencies)

- **PRD-106** — `ingredients` table; `ON DELETE CASCADE` target.
- **PRD-113** — seed data; this PRD extends the seed manifest with section tags.
- **PRD-118** — `app-food` shell.
- **PRD-122** — `/food/data` page; this PRD extends the Ingredients tab + adds a Tags sub-tab.
- **PRD-152** — primary consumer of `store-section:*` tags for the generator.
