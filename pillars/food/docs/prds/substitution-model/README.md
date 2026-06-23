# Substitution Model

Status: Done — schema, full CRUD, hydrated list, graph-view projection, cook-time per-line resolver, and solver integration all shipped. Deferred work (multi-hop chaining, curated context vocabulary, ML suggestions) lives in [ideas/substitution-graph-extensions.md](../../ideas/substitution-graph-extensions.md).

The substitution graph: directed edges declaring "A can stand in for B at ratio R, valid in these cooking contexts". Powers two reads — cook-time ("out of butter, what works in this savoury recipe?") and plan-time ("what can I cook tonight given current batches + valid subs?") — plus an explorer UI and a tabular CRUD editor.

## Design choices

- **Directed edges.** A bidirectional sub is two rows; the schema does not link them. This avoids `OR`-explosion across direction and makes asymmetric ratios first-class (butter→olive-oil at 0.75 is a separate edge from olive-oil→butter at 1.33).
- **Per-recipe override.** A row with `scope='recipe'` + `recipeId` set shadows the global edge for that one recipe. The resolver merges global + recipe-scoped, and a recipe-scoped edge supersedes the global edge **with the same `(from, to)` pair**; other global edges out of the same `from` survive.
- **One-hop only.** The resolver never chains subs (A→B→C is not auto-resolved); the user explicitly picks one hop.
- **JSON context column, not a junction table.** Context tags are a small write-once list per edge, read in bulk and filtered via `json_each` / app-side parse.

## Data model — `substitutions`

| Column                                   | Type                     | Notes                                                |
| ---------------------------------------- | ------------------------ | ---------------------------------------------------- |
| `id`                                     | INTEGER PK               | autoincrement                                        |
| `from_ingredient_id` / `from_variant_id` | INTEGER FK               | XOR — exactly one set                                |
| `to_ingredient_id` / `to_variant_id`     | INTEGER FK               | XOR — exactly one set                                |
| `ratio`                                  | REAL, default 1.0        | `qty_substitute = qty_original × ratio`; CHECK `> 0` |
| `context_tags`                           | TEXT, default `'[]'`     | JSON array of strings; `[]` = wildcard (any context) |
| `scope`                                  | TEXT, default `'global'` | CHECK IN (`'global'`,`'recipe'`)                     |
| `recipe_id`                              | INTEGER FK               | set iff `scope='recipe'`                             |
| `notes`                                  | TEXT nullable            |                                                      |
| `created_at`                             | TEXT                     | `datetime('now')`                                    |

CHECKs: `ck_subs_xor_from`, `ck_subs_xor_to` (exactly-one per side), `ck_subs_scope_recipe` (`recipe_id` set iff `scope='recipe'`), `ck_subs_scope` (enum mirror), `ck_subs_ratio_positive`.

Indexes: `idx_subs_from_ing`, `idx_subs_from_var`, and **eight partial UNIQUE indexes** that defeat SQLite's NULL-as-distinct rule on the four-column `(from, to)` tuple — four `uq_subs_global_*` (one per from/to ingredient-vs-variant combo) and four `uq_subs_recipe_*` (same shapes, plus `recipe_id` in the index, gated on `scope='recipe'`).

Ratio semantics: butter→olive-oil at 0.75 means "use 0.75 cups oil per 1 cup butter". v1 context vocabulary (recommended, unenforced): `savory`, `sweet`, `baking`, `frying`, `dressing`, `marinade`, `garnish`, `vegan`, `dairy-free`, `gluten-free`.

## REST API (`/substitutions`)

| Method + path                     | Purpose                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /substitutions`              | List, raw FK ids. Filters: `fromIngredientId`, `fromVariantId`, `toIngredientId`, `toVariantId`, `scope`, `recipeId`, `contextTag` |
| `GET /substitutions/hydrated`     | Same filters, each endpoint widened with `{kind, id, slug, name, parentSlug}` + `recipeSlug`                                       |
| `GET /substitutions/graph-view`   | Node/edge projection; filters `scope`, `recipeId`, `contextTag`, `search` (search applied app-side over slugs/names)               |
| `GET /substitutions/resolve-line` | Per-line cook-time candidates with batch coverage; query `recipeVersionId`, `lineIndex`; 404 when the line is absent               |
| `POST /substitutions`             | Create an edge; `from`/`to` are XOR endpoint objects; `CannotSubstituteSelf` → 400                                                 |
| `PATCH /substitutions/:id`        | Update `ratio`, `contextTags`, `notes` only                                                                                        |
| `DELETE /substitutions/:id`       | Delete one edge                                                                                                                    |

Endpoint shape is XOR at the zod layer (exactly one of `ingredientId` / `variantId`) and at the service. Literal paths (`/graph-view`, `/resolve-line`, `/hydrated`) are declared before the `/:id` param routes.

## Business rules

- Edges are directed; bidirectional = two rows, unlinked.
- Same `(from, to, scope, recipe_id)` tuple is rejected by the partial UNIQUE indexes (covering all four from/to ingredient-vs-variant shapes × both scopes), since the naive four-column UNIQUE would let NULL-as-distinct duplicates slip in.
- Ratio is strictly positive (CHECK).
- `context_tags` is written via `JSON.stringify`; reads parse back to `string[]` and reject non-array / non-string elements. Empty array = wildcard.
- Self-substitution (`from = to` on the same side) is rejected at the service with `CannotSubstituteSelf`.
- Recipe deletion removes its recipe-scoped subs in the same transaction (`deleteRecipeScopedSubstitutions`); soft-archiving a recipe leaves them intact.
- **Context filter (OR-overlap):** an edge with empty `context_tags` matches any context; otherwise it matches iff at least one tag overlaps the recipe's tags. A `contextTag` query filter also keeps wildcard edges (`json_array_length = 0 OR json_each value = tag`).
- **Override resolution:** recipe-scoped edges override the global edge with the same `(from, to)` pair key for that recipe; unrelated global edges from the same `from` are unaffected.
- **Cook-time resolver** matches an edge's `from` side against the line: a variant-side `from` pins to that variant; an ingredient-side `from` applies to any variant of the ingredient. Ingredient-level `to` edges fan out to all the ingredient's variants, each hydrated with its batch inventory.
- **Plan-time solver** (`can-i-cook`): a recipe line is satisfiable if FIFO batches cover its qty, else if a one-hop sub candidate has a batch clearing the threshold; otherwise the recipe is not cookable. Ranking + display caps live in the UI.

## Edge cases

| Case                                                                    | Behaviour                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `from` ingredient → `to` variant (e.g. butter → olive-oil:extra-virgin) | Allowed; matched at variant precision                         |
| Empty `context_tags`                                                    | Wildcard — applies in any context                             |
| `context_tags=['savory','baking']`                                      | Matches when the recipe's tags include `savory` OR `baking`   |
| Two global subs for same `(from, to)`                                   | Partial UNIQUE rejects                                        |
| Global + recipe-scoped sub for same `(from, to)`, different scope       | Allowed; resolver picks the recipe-scoped one for that recipe |
| Recipe hard-delete with extant per-recipe subs                          | Deleted in the same transaction; soft-archive leaves them     |
| Sub from a recipe-yield ingredient                                      | Allowed ("no homemade salsa → canned at 1.0")                 |
| Bidirectional sub stored as one row                                     | Schema doesn't catch it; create the reverse row in the UI     |
| Context tag typo (`sourry`)                                             | Stored as-is; vocabulary curation deferred                    |
| Sub against an archived ingredient                                      | Allowed; UI may filter, schema does not                       |

## UI

- **Data → Substitutions tab** (`pages/data/substitutions-tab/`): create form with XOR ingredient/variant endpoint pickers, filter bar, and an editable table (inline ratio/contextTags/notes edit, delete).
- **Substitution graph explorer** (`pages/data/substitutions-graph/`): force-directed canvas + radial focus view over the `graph-view` projection, with node/edge detail panels and scope/context/search filters.
- **Cook modal** (`components/cook/`): `BatchOverridePicker` Substitutions section consumes `resolve-line`, ranks candidates, and caps the displayed set.
- **Solve page** (`pages/solve/`): "what can I cook tonight" results with a per-recipe sub breakdown expander.

## Acceptance criteria

### Schema

- [x] `substitutions` table per the data model, with all five CHECKs and the FK references verifiable via PRAGMA.
- [x] Eight partial UNIQUE indexes (four global, four recipe) defeat SQLite's NULL-as-distinct rule on the `(from, to)` tuple.

### Invariants (each covered by a Vitest case)

- [x] Both `from_ingredient_id` AND `from_variant_id` set → CHECK fails (same for the `to` side).
- [x] Neither side set on `from` or `to` → fails.
- [x] `scope='recipe'` with no `recipe_id` → fails; `scope='global'` with `recipe_id` → fails.
- [x] `ratio = 0` or negative → fails.
- [x] Two global subs for the same `(from, to)` → partial UNIQUE fails.
- [x] Two recipe-scoped subs for the same `(from, to, recipe_id)` → fails.
- [x] A global AND a recipe-scoped sub for the same `(from, to)` (different scope) → succeeds.
- [x] Service rejects self-substitution with `CannotSubstituteSelf` (→ 400 over REST).
- [x] `context_tags` JSON round-trips: insert `["savory","baking"]`, read back identical array; `json_each` filter matches the requested tag and keeps wildcard edges.

### Resolution & solver

- [x] Recipe-scoped edge overrides the global edge with the same `(from, to)` pair for that recipe; unrelated global edges survive.
- [x] OR-overlap context filter: empty tags = wildcard; non-empty matches on any tag intersection with the recipe's tags.
- [x] `resolve-line` returns per-line candidates hydrated with batch inventory; missing line → 404.
- [x] Solver marks a line satisfiable via FIFO batches, else a one-hop sub with a covering batch; chaining is never attempted.

### UI

- [x] Substitutions tab supports create (XOR endpoint pickers), filter, inline edit, and delete.
- [x] Graph explorer renders the `graph-view` node/edge projection with scope/context/search filters.
