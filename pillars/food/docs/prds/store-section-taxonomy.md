# Store-Section Taxonomy

> Status: **Done.** Schema, service, REST contract, seed step, and both UI surfaces (per-ingredient chip editor + read-only Tags vocabulary tab) are shipped. Deferred surfaces (bulk multi-select editor, tag rename/merge, canonicalisation suggestions) live in [ideas/tag-management-and-canonicalisation.md](../ideas/tag-management-and-canonicalisation.md).

Free-form tags attached to ingredients via the `ingredient_tags` many-to-many table. Tags follow a namespaced convention — `store-section:produce`, `diet:vegan`, `allergen:nuts` — but the namespace is convention only, never enforced. The shopping-list sectioner reads `store-section:*` tags to group the generated list by aisle; ingredients with no section tag land in "Other".

The same table carries any future namespace (`diet:*`, `allergen:*`, `cuisine:*`) with no schema change.

## Data model

`ingredient_tags` (food pillar SQLite DB):

| Column          | Type             | Notes                                      |
| --------------- | ---------------- | ------------------------------------------ |
| `ingredient_id` | INTEGER NOT NULL | FK → `ingredients(id)` `ON DELETE CASCADE` |
| `tag`           | TEXT NOT NULL    | stored verbatim after normalisation        |
| `created_at`    | TEXT NOT NULL    | default `datetime('now')`                  |

- PK `(ingredient_id, tag)` — prevents duplicate tag per ingredient; makes single-tag insert idempotent.
- `idx_ingredient_tags_tag` on `tag` (hand-edited to `COLLATE NOCASE`) — case-insensitive autocomplete lookup without scanning.
- `idx_ingredient_tags_namespace` — partial expression index on the namespace prefix (`SUBSTR(tag, 1, INSTR(tag||':', ':') - 1) WHERE INSTR(tag, ':') > 0`); drives `WHERE tag LIKE 'store-section:%'`, which the sectioner runs every generation.
- `ON DELETE CASCADE`: deleting an ingredient drops all its tags. Tags hold no data the ingredient row doesn't.

A separate table (not a JSON column on `ingredients`) keeps section-grouping an indexed O(1) lookup instead of a `json_each` full-scan per recipe-line.

### Tag value rules

- Normalised on every write: leading/trailing trim, then lowercase. Stored verbatim thereafter.
- Must match `^[a-z0-9_-]+(:[a-z0-9_-]+)*$` — one or more `[a-z0-9_-]` segments joined by `:`. Multi-segment tags (`diet:strict-vegan`) are allowed.
- Max 64 chars (enforced in the service, not the schema).
- Empty / whitespace-only / illegal chars / over-length are rejected with a typed reason.
- "Namespace" = the segment before the first `:` (or the whole tag if no `:`). Informational only — no namespace-level validation.

## REST API surface

ts-rest contract, mounted under the `ingredientTags` sub-router of the food contract. Writes go through `set` (full replacement) only — there is no single add/remove endpoint on the wire. Validation failures are returned as data (`{ ok: false, reason }`), not HTTP errors.

| Method + path                                           | Purpose                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /ingredient-tags?ingredientId=`                    | List one ingredient's tags (sorted)                                                   |
| `GET /ingredient-tags/distinct?namespacePrefix=&limit=` | Distinct tags with usage counts; optional namespace filter; default limit 50, max 500 |
| `GET /ingredient-tags/by-tag?tag=`                      | Ingredients carrying a tag → `{ id, slug, name }[]`                                   |
| `PUT /ingredient-tags/:ingredientId`                    | Replace the full tag set in one transaction; body `{ tags: string[] }`                |

`distinct` response rows: `{ tag, ingredientCount, firstSeenAt }`, sorted by `ingredientCount DESC` then tag ASC. `set` returns `{ ok: true } | { ok: false; reason: 'BadTagFormat' | 'TagTooLong' | 'IngredientNotFound' }`.

The service layer (`src/db/services/ingredient-tags.ts`) backs these and also exposes `addTagToIngredient`, `removeTagFromIngredient`, `listIngredientsByTag`, and `countIngredientsInNamespace` for the seed step and internal callers.

## Business rules

- Tags are lowercased + trimmed at the service boundary on every write.
- `set` runs DELETE-all-then-INSERT-new for the ingredient inside a single transaction; the new set is de-duplicated first. Empty `tags: []` clears every tag.
- An ingredient can carry any number of tags across any namespaces.
- The shopping sectioner (`src/api/modules/shopping`) reads only `store-section:*` tags; other namespaces sit alongside as no-ops for shopping.
- Deleting an ingredient cascades to drop its tags.
- Autocomplete returns the top 50 most-used tags by default; the user types to filter, scroll re-queries.
- Renaming a tag in v1 = full-set replace per affected ingredient (no native rename).

## v1 store-section vocabulary

Suggested, not enforced — users add custom sections (`store-section:butcher`) without a migration. The seed step (`src/seed/step-ingredient-tags.ts`) applies `store-section:*` tags to the seeded ingredients after ingredient/variant seeding populates the slug→id map:

- **produce**: onion, garlic, tomato (+ roma/cherry variants), potato (+ desiree), carrot, lemon, corn, parsley
- **dairy**: butter, milk, egg (eggs follow aisle layout, not taxonomy), cheese
- **meat**: chicken, beef
- **pantry**: flour, salt, pepper, sugar, olive-oil
- **bakery**: bread
- **Other (no tag)**: anything uncategorised

Sections with no seeded ingredient (`frozen`, `condiments`, `beverages`) populate only as the user tags their own library — keeping the vocabulary tab honest about what's pre-curated. Slugs absent from the fixture set are silently skipped so a fixture reshuffle never fails the seed.

## UI

Extends the `/food/data` page (food app, `pillars/food/app/src/pages/data`).

**Ingredient detail panel — Tags section** (`ingredients-tab/IngredientTagsEditor.tsx`):

- Chip list of current tags, each with `×` to remove.
- "+ Add tag" input with a datalist autocomplete sourced from `GET /ingredient-tags/distinct`.
- Local draft committed via `PUT /ingredient-tags/:id`; `{ ok: false, reason }` surfaces inline as localised copy.

**Tags vocabulary tab** at `/food/data/tags` (`tags-tab/TagsTab.tsx`), read-only:

- Grouped by namespace (`store-section`, `diet`, …, and `(no namespace)`).
- Each row: tag, ingredient count, first-seen, click → drill into the ingredients-by-tag list via `GET /ingredient-tags/by-tag`.
- Useful for spotting drift (`store-section:produce` vs a stray capitalised duplicate) before a list is generated.

## Edge cases

| Case                                         | Behaviour                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `store-section:Produce` (capitalised)        | Lowercased to `store-section:produce`; stored once.                         |
| `store-section: produce` (inner space)       | Inner space fails the regex → `BadTagFormat` (only leading/trailing trim).  |
| `store-section:café` (non-ASCII)             | Fails the regex → `BadTagFormat`.                                           |
| Same `(ingredient, tag)` twice               | Idempotent via PK; second insert is a no-op.                                |
| Delete ingredient with N tags                | `ON DELETE CASCADE` drops all N rows.                                       |
| 65-char tag                                  | `TagTooLong`.                                                               |
| `set` with `tags: []`                        | Clears all tags. Allowed.                                                   |
| 500 distinct tags in autocomplete            | Returns top 50 by usage; user filters by typing.                            |
| `store-section` (no value segment)           | Passes the regex; convention violation the UI may warn on but won't reject. |
| Multiple `store-section:*` on one ingredient | All stored; the sectioner picks one deterministically.                      |
| Concurrent edits from two browsers           | Last write wins (single-user; rare).                                        |

## Acceptance criteria

### Schema

- [x] `ingredient_tags(ingredient_id, tag, created_at)` exists with PK `(ingredient_id, tag)` and `ON DELETE CASCADE` (`src/db/schema/food-ingredients.ts`).
- [x] `idx_ingredient_tags_tag` (NOCASE) and the `idx_ingredient_tags_namespace` expression index back the autocomplete and `store-section:%` lookups.
- [x] Deleting an ingredient drops its tags (CASCADE verified in tests).

### Service

- [x] `setTagsForIngredient` replaces the full set in one transaction; de-dupes; empty set clears.
- [x] `addTagToIngredient` idempotent on the PK; `removeTagFromIngredient` a no-op when absent.
- [x] `listTagsForIngredient` / `listIngredientsByTag` / `listDistinctTags` (with + without namespace filter) exposed.
- [x] Normalisation = trim + lowercase; regex + 64-char cap enforced; returns `BadTagFormat` / `TagTooLong` / `IngredientNotFound`.

### REST contract

- [x] `GET /ingredient-tags`, `GET /ingredient-tags/distinct`, `GET /ingredient-tags/by-tag`, `PUT /ingredient-tags/:ingredientId` mounted under `ingredientTags` and projected to OpenAPI.
- [x] `distinct` accepts optional `namespacePrefix` (e.g. `store-section`) and `limit` (default 50, max 500).
- [x] `set` returns the structured `{ ok }` result; validation failures are data, not HTTP errors.

### Seed

- [x] `seedIngredientTags` applies `store-section:*` to seeded ingredients; only produce/dairy/meat/pantry/bakery seeded.
- [x] After seed, `distinct({ namespacePrefix: 'store-section' })` returns ≥ 4 distinct sections.

### UI

- [x] Ingredient detail panel shows a Tags section: chip list + "+ Add tag" autocomplete (usage-sorted suggestions), committed via `set`.
- [x] `/food/data/tags` renders the read-only Tags vocabulary tab grouped by namespace with drill-down.

### Tests

- [x] `src/db/__tests__/ingredient-tags.test.ts` covers PK uniqueness, CASCADE, regex + length validation, `set` round-trip, and `distinct` with/without namespace.
- [x] `src/api/__tests__/ingredient-tags.test.ts` covers the REST handlers.
- [x] RTL suites: `app/src/pages/data/ingredients-tab/__tests__/IngredientTagsEditor.test.tsx` and `app/src/pages/data/tags-tab/__tests__/TagsTab.test.tsx`.

## Consumers & dependencies

- `ingredients` table — CASCADE target.
- Seed manifest — extended with section tags.
- `/food/data` page — host for both UI surfaces.
- Shopping-list sectioner (`src/api/modules/shopping`) — primary consumer of `store-section:*` via `src/api/modules/shopping/load-tags.ts`.
