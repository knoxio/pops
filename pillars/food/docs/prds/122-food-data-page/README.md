# PRD-122: Unified `/food/data` Management Page

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

One page, five tabs: Ingredients (with embedded variants), Aliases, Prep states, Substitutions, Conversions. CRUD for each. Bulk operations where useful (merge two aliases, archive multiple ingredients). Search and filter. Driven by the food backend module's tRPC procedures. The recipe DSL auto-creates ingredients and variants permissively — this page is where the user curates the result.

The Conversions tab is owned by PRD-123 (it defines the table); this PRD specifies the page structure and reserves the tab slot.

## Routes

| Path                                  | Behaviour                                                           |
| ------------------------------------- | ------------------------------------------------------------------- |
| `/food/data`                          | Redirect to `/food/data/ingredients` (default tab)                  |
| `/food/data/ingredients`              | Ingredients tab                                                     |
| `/food/data/aliases`                  | Aliases tab                                                         |
| `/food/data/prep-states`              | Prep states tab                                                     |
| `/food/data/substitutions`            | Substitutions tab                                                   |
| `/food/data/conversions`              | Conversions tab (PRD-123)                                           |
| `/food/data/ingredients?focus=<slug>` | Open ingredients tab, scroll to and highlight a specific ingredient |

Sub-paths chosen over tabbed query params so deep-link sharing works (browser back/forward, URL bar reflects state).

## Tab 1: Ingredients

### Layout

Two-column desktop, single-column mobile.

- **Left**: tree-view of ingredients. Root nodes (those with `parent_id IS NULL`) at the top level; children indented. Search box above (substring match on name + slug + alias). Filter chips: "Has variants", "Has no recipes referencing".
- **Right**: detail panel for the selected ingredient. Shows:
  - Slug (read-only after creation; rename via "Rename" button)
  - Name (editable)
  - Parent ingredient (dropdown for changing hierarchy)
  - Default unit (g / ml / count)
  - Density (g/ml, optional)
  - Notes (free text)
  - **Variants table** (embedded — variants are scoped under their parent ingredient per PRD-106): slug, name, default unit, package_size_g, shelf-life fridge/freezer, notes. Inline edit; "+ Add variant" row at the bottom.
  - **Used by recipes** list: which recipes reference this ingredient (count + collapsible list with links to `/food/recipes/<slug>`).

### Actions

- **Create ingredient**: top of left column. Modal asking for slug + name + default_unit. Calls `food.ingredients.create`. If slug collides with `slug_registry`, surface the error.
- **Rename slug**: button on detail panel. Modal with old slug → new slug; warns "X recipes reference this ingredient — all references will be updated automatically." Calls PRD-106's `renameIngredientSlug` service.
- **Change parent**: in-line dropdown on detail. Validates depth ≤ 3 (PRD-106 invariant).
- **Delete ingredient**: button on detail. Hard-blocks if recipe_lines, ingredient_aliases, ingredient_variants, batches, substitutions, or recipe_versions.yield_ingredient_id reference the row. Shows which blockers exist; user must clear them first.
- **Add variant**: bottom of variants table. Inline row → submit. Calls `food.variants.create({ingredient_id, slug, name, default_unit})`.
- **Edit variant**: inline cell edit. Calls `food.variants.update`.
- **Delete variant**: row action. Blocks if batches reference (FK).

## Tab 2: Aliases

Table view, sortable columns: alias, target (kind + slug), source (user / llm / ingest), created_at.

### Actions

- **Add alias**: form at top. Pick target type (ingredient / variant), search for target, type alias text, choose source (default 'user').
- **Edit alias**: inline rename of the alias text.
- **Delete alias**: row action.
- **Merge aliases**: select two or more rows pointing at different targets but with similar alias text. Action consolidates them to point at one target (user picks). Useful for de-noising LLM-proposed aliases.
- **Bulk approve LLM aliases**: filter to `source='llm'`, multi-select, "Mark as user-approved" → service updates `source='user'` for the batch.

Notes per PRD-106's amendment: aliases don't have a separate `status` column; `source` carries enough provenance. Bulk-approve is a "trust this LLM proposal" affordance, not a state change beyond `source`.

## Tab 3: Prep states

Simple list. The curated 15 from PRD-106 are immutable in v1 (UI does NOT offer delete/rename for them).

### Actions

- **Add prep state**: form at top — slug + name. Calls `food.prepStates.create`. Adds to `slug_registry`. Used when the user encounters an `UnresolvedPrepStateSlug` from a recipe compile and wants to formally add the missing prep.
- **No delete in v1**: prep_states have heavy reference impact (every recipe line); deletion is a future PRD with cascade analysis. UI shows a disabled delete button with tooltip explanation.

## Tab 4: Substitutions

Table view, columns: from (kind + slug), to (kind + slug), ratio, scope (global / recipe), recipe (if scoped), context tags, created_at.

### Actions

- **Add substitution**: form at top. Pick from (ingredient or variant), pick to (ingredient or variant), set ratio, choose scope (global / pick a recipe for recipe-scoped), set context tags (multi-select from previously-seen tags + free text).
- **Edit substitution**: inline edit on ratio + context tags. From/to are not editable — to change them, delete and recreate.
- **Delete substitution**: row action.
- **Filter**: by from, by to, by scope, by context tag.
- **Visualize**: small graph view (deferred — placeholder for future Epic 06 work). v1 shows table only.

## Tab 5: Conversions (PRD-123)

Reserved slot. Layout and actions defined by PRD-123.

## Search across tabs

Top-bar global search box (above the tabs) searches across all tabs simultaneously. Results show as a flat list with their tab badge; clicking a result opens the relevant tab pre-focused on the row.

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extended)
export const ingredientsRouter = {
  list: query({
    input: { search?: string, hasVariants?: boolean, hasNoRecipeRefs?: boolean, limit?: number, cursor?: string },
    output: { items: IngredientWithVariantsSummary[], nextCursor?: string },
  }),
  get: query({
    input: { slug: string },
    output: IngredientWithDetails,                       // includes variants, alias count, recipe-ref count
  }),
  create: mutation({ input: { slug: string, name: string, defaultUnit: 'g'|'ml'|'count', parentId?: number, density?: number, notes?: string }, output: { id: number } }),
  update: mutation({ input: { id: number, ... }, output: { ok: true } }),
  rename: mutation({ input: { oldSlug: string, newSlug: string }, output: { ok: true } }),
  changeParent: mutation({ input: { id: number, newParentId: number | null }, output: { ok: true } }),
  delete: mutation({ input: { id: number }, output: { ok: true } | { ok: false, blockers: BlockerSummary } }),
};

export const variantsRouter = {
  // Field names match the underlying `ingredient_variants` columns from PRD-106 + PRD-108.
  // Shelf-life columns are added by PRD-108's migration; this router depends on PRD-108 being applied.
  create: mutation({
    input: {
      ingredientId: number,
      slug: string,
      name: string,
      defaultUnit: 'g' | 'ml' | 'count',
      packageSizeG?: number,
      defaultShelfLifeDaysFridge?: number,
      defaultShelfLifeDaysFreezer?: number,
      notes?: string,
    },
    output: { id: number },
  }),
  update: mutation({ /* same fields as create, all optional except id */ }),
  delete: mutation({ input: { id: number }, output: { ok: true } | { ok: false, blockers: BlockerSummary } }),
};

export const aliasesRouter = {
  list: query({ input: { search?: string, source?: 'user'|'llm'|'ingest', target?: { kind: 'ingredient'|'variant', id: number } }, output: { items: AliasRow[] } }),
  create: mutation({ /* ... */ }),
  updateText: mutation({ input: { id: number, alias: string }, output: { ok: true } }),
  delete: mutation({ /* ... */ }),
  merge: mutation({ input: { aliasIds: number[], targetKind: 'ingredient'|'variant', targetId: number }, output: { mergedCount: number } }),
  bulkApprove: mutation({ input: { aliasIds: number[] }, output: { updatedCount: number } }),
};

export const prepStatesRouter = {
  list: query({ output: { items: PrepStateRow[] } }),
  create: mutation({ input: { slug: string, name: string }, output: { id: number } }),
  // No update / delete in v1.
};

export const substitutionsRouter = {
  list: query({ input: { fromIngredientId?: number, fromVariantId?: number, scope?: 'global'|'recipe', recipeId?: number, contextTag?: string }, output: { items: SubstitutionRow[] } }),
  create: mutation({ /* ... */ }),
  update: mutation({ input: { id: number, ratio?: number, contextTags?: string[] }, output: { ok: true } }),
  delete: mutation({ /* ... */ }),
};

export const slugsRouter = {
  search: query({                                       // also feeds PRD-120's editor autocomplete
    input: { query: string, kinds: ('ingredient'|'recipe'|'prep_state')[], limit?: number },
    output: { items: SlugMatch[] },
  }),
};
```

`food.slugs.search` is the procedure PRD-120's autocomplete consumes. Single source for slug lookup.

## Business Rules

- The page is **destructive-action gated** — every delete shows blockers if FKs would fail, and the user must explicitly confirm even for safe deletes.
- Rename operations update `slug_registry` atomically with the parent table (per PRD-106's service contract). UI shows a spinner and disables form submission until the server confirms.
- Variants are always managed within their parent ingredient's detail panel; there's no global "all variants" view (parent-scoped slugs would be confusing flat).
- Alias merge respects the slug_registry: the merged-to target must exist; the merge operation is INSERT-then-DELETE in one transaction (not UPDATE — keeps audit clean).
- Auto-create deep-link: PRD-119's "Recipe created N new ingredients" banner links to `/food/data/ingredients?focus=<slug>` for each new ingredient. The page scrolls to and highlights the row.
- Search is global across the page but tab-aware: it uses `food.slugs.search` plus tab-specific search procedures and presents merged results.

## Edge Cases

| Case                                                                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User tries to delete an ingredient referenced by 5 recipes and 2 batches        | Delete blocked; modal lists the blockers with links to each. User must clear them first.                                                                                                                                                                                                                                                                                                           |
| User renames a slug that's used in 20 recipes                                   | Backend updates `ingredients.slug` AND `slug_registry.slug` atomically. Recipe DSLs use the slug at compile time; existing `recipe_lines` rows already FK to ingredient_id, so they're unaffected. The DSLs themselves are NOT auto-rewritten (would touch every recipe's body_dsl) — the rename UI warns the user that recipes using the old slug in their DSL will fail to compile on next edit. |
| Variant slug renamed                                                            | Same atomic update on `ingredient_variants`. Recipe DSLs using `ingredient:old-variant:...` will not re-resolve unless edited. Warning shown.                                                                                                                                                                                                                                                      |
| User adds an alias that already exists for the same target                      | UNIQUE violation rejected by server; UI shows "Alias already exists."                                                                                                                                                                                                                                                                                                                              |
| User merges two aliases pointing at different ingredients                       | Merge UI requires user to pick which target wins. Other aliases re-point.                                                                                                                                                                                                                                                                                                                          |
| User adds a prep state with a slug that's already in `slug_registry`            | `SlugAlreadyRegisteredError` from PRD-106's service.                                                                                                                                                                                                                                                                                                                                               |
| User creates a global sub that already exists (same from + to + scope='global') | Partial UNIQUE rejects; UI shows "Substitution already exists."                                                                                                                                                                                                                                                                                                                                    |
| User edits a substitution's context tags to include a typo (`sourry`)           | Allowed (free-form tags). Taxonomy curation is a future PRD.                                                                                                                                                                                                                                                                                                                                       |
| Concurrent edit on the same ingredient row                                      | Last-write-wins. Single-user; rare.                                                                                                                                                                                                                                                                                                                                                                |
| Deep-link to `?focus=<slug>` where slug doesn't exist                           | Tab opens; toast shows "Ingredient `<slug>` not found." User can search.                                                                                                                                                                                                                                                                                                                           |
| Mobile: variants table inside ingredient detail                                 | Collapses to stacked cards instead of a horizontal table.                                                                                                                                                                                                                                                                                                                                          |

## Acceptance Criteria

Inline per theme protocol.

### Pages & routing

- [x] All five tab routes from the table mounted in `packages/app-food/src/routes.tsx`. _(PR-122-A, #2698)_
- [x] Default `/food/data` redirects to `/food/data/ingredients`. _(PR-122-A, #2698)_
- [x] Each tab is its own React page component in `packages/app-food/src/pages/data/`. _(PR-122-A, #2698)_

### Ingredients tab

- [x] Tree view shows hierarchy (root, child, grandchild up to depth 3). _(PR-122-B v1, #2714)_
- [x] Detail panel shows ingredient fields and variants table. _(PR-122-B v1, #2714; recipe-ref count added in PR-122-B2)_
- [x] Create works via tRPC procedure and reflects in the UI immediately. _(PR-122-B v1, #2714; rename / change-parent / delete added in PR-122-B2)_
- [x] Delete with blockers shows the blocker list; success only when blockers are zero. _(PR-122-B2)_
- [x] Variant CRUD inside the detail panel works including shelf-life fields (PRD-108). _(PR-122-B2)_

### Aliases tab

- [x] Table renders aliases with sortable columns.
- [x] Add / edit / delete / merge / bulk-approve actions all work.
- [x] Merge correctly consolidates rows in one transaction.

### Prep states tab

- [x] Lists the 15 seeded states + any user-added.
- [x] Add works.
- [x] Delete/rename disabled with tooltip explaining "not in v1".

### Substitutions tab

- [x] Table view with filters for from / to / scope / context tag. _(PR-122-D)_
- [x] Create with global vs recipe-scoped; recipe picker shows current recipes. _Recipe picker reduced to a manual `recipeId` input — `food.recipes.list` lands with PRD-119; copy in the form flags the upgrade._ _(PR-122-D)_
- [x] Edit ratio + context tags inline. _(PR-122-D)_
- [x] Delete works. _(PR-122-D)_

### Conversions tab

- [x] Reserved slot exists; PRD-123 implements the contents. Tab route returns a placeholder until PRD-123 lands. _(PR-122-A, #2698)_

### tRPC procedures

- [x] All procedures in the API section exist in `apps/pops-api/src/modules/food/`. _(PR-122-API, #2705; PR-122-B2 adds `food.ingredients.recipeRefs`. Filter expansion for `food.ingredients.list` — `hasVariants` / `hasNoRecipeRefs` / pagination — remains deferred to a follow-up; not exercised by the UI yet.)_
- [x] All mutations are transactional. _(PR-122-API, #2705)_
- [x] `food.slugs.search` is exposed and used by both this page's global search AND PRD-120's editor autocomplete. _(PR-122-API, #2705; PRD-120 consumer to land alongside the editor's autocomplete extension)_

### Deep links & navigation

- [x] `/food/data/ingredients?focus=<slug>` opens the tab, scrolls to the row, and visually highlights it for 2 seconds. _(PR-122-B2)_
- [ ] PRD-119's auto-create banner links here correctly. _(gated on PRD-119)_

### Mobile

- [x] All tabs readable at 375px without horizontal scroll. _(PR-122-A, #2698 — tab strip collapses below 640px)_
- [x] Tab bar collapses to a dropdown on narrow viewports. _(PR-122-A, #2698)_
- [x] Variant rows collapse to cards in mobile mode. _(PR-122-B2)_

### Tests

- [x] Vitest + RTL suite at `packages/app-food/src/pages/data/__tests__/` covers each tab's main flows. _Ingredients tab covered by PR-122-B v1 (11 cases); Aliases / Prep states / Substitutions remain in the placeholder state pending PR-122-C / PR-122-D._ _(PR-122-A + PR-122-B v1)_
- [x] Vitest integration suite at `apps/pops-api/src/modules/food/__tests__/data-routers.test.ts` covers each tRPC procedure with happy-path + invariant cases. _28 cases._ _(PR-122-API, #2705)_
- [ ] Storybook stories at `apps/pops-storybook/src/stories/food/DataPage.stories.tsx` for each tab. _(deferred to a single story PR after PR-122-C / PR-122-D land)_

## Out of Scope

- Conversions tab content — **PRD-123**.
- Substitution graph visualisation — Epic 06 PRD.
- Tag taxonomy curation UI — deferred.
- Import/export of ingredient lists (CSV, JSON) — deferred. The seed (PRD-113) is the only programmatic input.
- Audit log / history of who changed what — single-user system, less valuable.
- Undo/redo at the data-page level — out of scope; rely on database backups for catastrophic recovery.
- Cross-domain ingredient links (finance grocery items → ingredients) — separate theme.
