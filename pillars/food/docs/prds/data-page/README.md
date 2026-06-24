# Food Data Management Page

> Status: **Done** — six-tab `/food/data` curation surface, global search, and deep-link focus all shipped. The Ingredients "Has variants" / "Has no recipes referencing" filter chips and list pagination were never built; see [data-page-extensions](../../ideas/data-page-extensions.md).

One page, six tabs, for curating everything the recipe DSL and ingest pipeline create permissively: **Ingredients** (with embedded variants and tags), **Aliases**, **Prep states**, **Substitutions**, **Conversions**, **Tags**. CRUD per tab, plus bulk operations where useful (merge aliases, bulk-approve LLM aliases). A global search box above the tabs spans the whole page. Conversions content is owned by the [conversion-table](../conversion-table/README.md) PRD, the Tags vocabulary view by [store-section-taxonomy](../store-section-taxonomy/README.md), and the substitution graph view by [substitution-graph-explorer](../substitution-graph-explorer/README.md) — this page reserves and mounts their slots.

## Routes

Lives under the food app at `/food/data`; the SPA host is `pillars/shell`. Sub-paths (not query params) so deep links survive back/forward.

| Path                                  | Behaviour                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `/food/data`                          | Redirect to `/food/data/ingredients`                                          |
| `/food/data/ingredients`              | Ingredients tab                                                               |
| `/food/data/aliases`                  | Aliases tab                                                                   |
| `/food/data/prep-states`              | Prep states tab                                                               |
| `/food/data/substitutions`            | Substitutions tab                                                             |
| `/food/data/substitutions/graph`      | Graph view (substitution-graph-explorer); Substitutions tab stays highlighted |
| `/food/data/conversions`              | Conversions tab (conversion-table PRD)                                        |
| `/food/data/tags`                     | Tags vocabulary tab (store-section-taxonomy)                                  |
| `/food/data/ingredients?focus=<slug>` | Open Ingredients tab, scroll to + highlight that row                          |

The active tab is derived from the URL — no client-side tab state. Desktop renders a tab strip; below 640px it collapses to a native `<select>` dropdown.

- [x] All tab routes mounted under `data` in `routes.tsx`; `index` redirects to `ingredients`.
- [x] Each tab is its own lazy-loaded page component under `app/src/pages/data/`.
- [x] Active-tab resolver keeps the Substitutions tab marked active while `/substitutions/graph` is open.

## REST API surface

The food pillar serves a ts-rest (zod) contract; cross-pillar callers use the `@pops/pillar-sdk` `pillar()` client. Endpoints consumed by this page:

**Ingredients** (`contract/rest-ingredients.ts`)

- `GET /ingredients?search&parentId` → `{ items: Ingredient[] }`
- `GET /ingredients/:idOrSlug` → `{ ingredient, variants }`
- `POST /ingredients` → created ingredient (slug, name, defaultUnit, parentId?, densityGPerMl?, notes?)
- `PATCH /ingredients/:id` → updated (name, defaultUnit, densityGPerMl, notes)
- `POST /ingredients/rename` `{ oldSlug, newSlug }` → updates the ingredient **and** the slug registry atomically
- `POST /ingredients/:id/parent` `{ newParentId }` → re-parent, cycle/depth guarded
- `GET /ingredients/:id/blockers` → `{ variants, aliases }` counts
- `GET /ingredients/:id/recipe-refs` → `{ count, recipes[] }`
- `DELETE /ingredients/:id` → `{ ok: true }` or `{ ok: false, blockers }`

**Variants** (`contract/rest-variants.ts`) — slugs scoped per parent (`UNIQUE(ingredient_id, slug)`), not in the global registry

- `POST /variants`, `PATCH /variants/:id`, `DELETE /variants/:id`. Fields include `packageSizeG`, `defaultShelfLifeDaysFridge/Freezer`, `notes`.

**Aliases** (`contract/rest-aliases.ts`)

- `GET /aliases?search&source&targetKind&targetId` and `GET /aliases/with-targets` (joined with resolved target metadata)
- `POST /aliases`, `PATCH /aliases/:id` (rename text), `DELETE /aliases/:id`
- `POST /aliases/merge` `{ aliasIds[], target }` → re-point N aliases onto one target
- `POST /aliases/bulk-approve` `{ aliasIds[] }` → flip `source='llm'` rows to `user`

**Prep states** (`contract/rest-prep-states.ts`)

- `GET /prep-states`, `POST /prep-states` `{ slug, name }`. No update/delete.

**Substitutions** (`contract/rest-substitutions.ts`)

- `GET /substitutions` and `GET /substitutions/hydrated?fromIngredientId&fromVariantId&toIngredientId&toVariantId&scope&recipeId&contextTag`
- `POST /substitutions` (XOR endpoints: exactly one of `ingredientId`/`variantId` per side; `scope='recipe'` requires `recipeId`)
- `PATCH /substitutions/:id` (ratio, contextTags, notes), `DELETE /substitutions/:id`
- `GET /substitutions/graph-view` — node/edge projection consumed by the [substitution-graph-explorer](../substitution-graph-explorer/README.md) graph page

**Ingredient tags** (`contract/rest-ingredient-tags.ts`)

- `GET /ingredient-tags?ingredientId`, `PUT /ingredient-tags/:ingredientId` (full replacement; returns `{ ok:false, reason }` for bad format)
- `GET /ingredient-tags/distinct` and `GET /ingredient-tags/by-tag` — feed the read-only Tags vocabulary tab

**Slugs** (`contract/rest-slugs.ts`)

- `GET /slugs/search?query&kinds&limit` → `{ items: { slug, kind, targetId, name }[] }`. Single source of slug lookup; powers this page's global search across ingredient / recipe / prep_state.

- [x] All endpoints above exist as ts-rest routes with REST handlers under `src/api/rest/*-handlers.ts`, registered in the manifest, OpenAPI-projected.
- [x] Mutations are transactional; rename/merge touch the slug registry in the same transaction.
- [x] `/slugs/search` is the sole slug-lookup surface (also intended for the recipe-editor autocomplete).

## Tab 1: Ingredients

Two-column desktop (tree left, detail right), single column on mobile. Tree shows the hierarchy (root → child → grandchild, depth ≤ 3) with a substring search box above. The detail panel for the selected ingredient shows slug (read-only; renamed via a button), name, parent, default unit (g/ml/count), density (g/ml), notes, an embedded **variants table** (slug, name, unit, package size, shelf-life fridge/freezer, notes — inline add/edit/delete), a **tags editor** (chips, full-replace via `PUT`), and a **"Used by recipes"** section (count + collapsible list linking to `/food/recipes/<slug>`).

- [x] Tree renders the hierarchy to depth 3; search filters by substring.
- [x] Detail panel shows all ingredient fields, the variants table, the tags editor, and the recipe-refs count + list.
- [x] Create (modal: slug + name + unit), rename slug (warns recipes reference it), change parent (cycle/depth guarded), delete all work via REST and reflect immediately.
- [x] Delete shows the blocker list (variants/aliases counts) and only succeeds when blockers are zero.
- [x] Variant create/edit/delete inside the detail panel works, including shelf-life fields; variant rows collapse to cards on mobile.

## Tab 2: Aliases

Sortable table (alias, target kind+slug, source, created_at) backed by `/aliases/with-targets`.

- [x] Table renders aliases with sortable columns (asc/desc toggle per column).
- [x] Add (pick ingredient/variant target, type alias, choose source), inline edit, delete all work.
- [x] Merge (multi-select rows, pick the winning target, INSERT-then-DELETE in one transaction) and bulk-approve (flip selected `llm` rows to `user`) work. `source` carries provenance — there is no separate `status` column.

## Tab 3: Prep states

Simple list of every prep state (seeded + user-added).

- [x] Lists all prep states; **Add** (slug + name) registers the slug and appears immediately.
- [x] No delete/rename in v1 — the delete button is disabled with a tooltip explaining the deferral (prep states have heavy `recipe_lines` reference impact).

## Tab 4: Substitutions

Table (from, to, ratio, scope, recipe, context tags, created_at) via `/substitutions/hydrated`, with filters and a create form.

- [x] Filters for from / to / scope / context tag.
- [x] Create with global vs recipe scope. The recipe target is a manual `recipeId` text input (not a picker); form copy flags it.
- [x] Inline edit of ratio + context tags; from/to are immutable (delete + recreate to change endpoints).
- [x] Delete works. A graph view at `/substitutions/graph` ([substitution-graph-explorer](../substitution-graph-explorer/README.md)) renders the node/edge projection.

## Tab 5: Conversions / Tab 6: Tags

- [x] Conversions slot mounts the conversion-table PRD's component (units + per-ingredient weights).
- [x] Tags slot mounts [store-section-taxonomy](../store-section-taxonomy/README.md)'s read-only vocabulary view — distinct tags grouped by namespace, drill-down to ingredients carrying each tag.

## Global search

A search box above the tabs queries `/slugs/search` (debounced). Results render as a flat list with a kind badge; picking an ingredient or prep_state navigates to that tab with `?focus=<slug>`. Recipe matches are shown but disabled (no in-page recipe tab).

- [x] Search returns ingredient / recipe / prep_state matches with a badge per result; navigable kinds deep-link with `?focus`.

## Business rules

- **Destructive-action gated**: every delete checks FK blockers and reports them; the user must clear blockers before a delete succeeds.
- **Atomic renames**: rename updates the parent table and `slug_registry` in one transaction. Recipe DSLs are NOT auto-rewritten — a DSL still referencing the old slug fails to compile on next edit; the rename UI warns about this.
- **Variants are parent-scoped**: managed only inside their ingredient's detail panel; there is no flat "all variants" view (parent-scoped slugs would be ambiguous flat).
- **Alias merge** requires the winning target to exist; it re-points via INSERT-then-DELETE (not UPDATE) to keep provenance clean.
- **Deep-link focus**: `?focus=<slug>` resolves the slug, expands ancestors, scrolls to, and highlights the row for 2 seconds; an unknown slug surfaces a not-found message.

## Edge cases

| Case                                                          | Behaviour                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delete an ingredient referenced by variants/aliases           | Blocked; modal lists blocker counts. User clears them first.                                                                                           |
| Rename a slug used by many recipes                            | `ingredients.slug` + `slug_registry` updated atomically; compiled `recipe_lines` FK to id so unaffected. DSL bodies are not rewritten — warning shown. |
| Variant slug renamed                                          | Same atomic update on `ingredient_variants`; DSLs using `ingredient:old-variant:…` won't re-resolve until edited.                                      |
| Add a duplicate alias for the same target                     | UNIQUE violation → "Alias already exists."                                                                                                             |
| Merge aliases pointing at different ingredients               | UI requires picking the winning target; others re-point.                                                                                               |
| Add a prep state whose slug is already registered             | `SlugAlreadyRegisteredError` (409) from the slug-registry service.                                                                                     |
| Create a global sub that already exists (same from+to+global) | Partial UNIQUE rejects → "Substitution already exists."                                                                                                |
| Substitution endpoints not XOR (both or neither set)          | 400 `CannotSubstituteSelf` / endpoint-shape error from the contract refine.                                                                            |
| Context tag typo                                              | Allowed (free-form). Canonical-vocabulary curation is a future PRD.                                                                                    |
| Concurrent edit on the same row                               | Last-write-wins (single-user).                                                                                                                         |
| `?focus=<slug>` where slug doesn't exist                      | Tab opens; not-found message shown; user can search.                                                                                                   |
| Mobile                                                        | Tab strip → `<select>`; variant rows → stacked cards; all tabs readable at 375px without horizontal scroll.                                            |

## Out of scope

- Conversions content — [conversion-table](../conversion-table/README.md) PRD.
- Substitution graph internals — [substitution-graph-explorer](../substitution-graph-explorer/README.md) (graph route is mounted here).
- Tags rename/merge/bulk — [store-section-taxonomy](../store-section-taxonomy/README.md) ships read-only; editing deferred.
- Ingredient "Has variants" / "Has no recipes referencing" filter chips + list pagination — [data-page-extensions](../../ideas/data-page-extensions.md).
- Auto-create banner that links here — the destination is built; the banner is in the recipe-create surface — [data-page-extensions](../../ideas/data-page-extensions.md).
- CSV/JSON import-export, audit log, undo/redo, cross-pillar ingredient links — deferred / out of scope.
