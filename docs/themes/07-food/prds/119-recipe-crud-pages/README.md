# PRD-119: Recipe CRUD Pages

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Build the recipe-facing pages under `/food/recipes/*`. List page with search and filter. Detail page that wraps PRD-121's renderer for read views. New + edit pages that wrap PRD-120's editor for write flows. Promote, archive, rename actions. tRPC procedures that back the pages, calling into PRD-107's services and PRD-116's `compileRecipeVersion`.

This is the largest user-visible PRD in Epic 01 — it integrates the editor and renderer into a working CRUD experience. Depends on PRDs 118 (scaffold), 120 (editor), 121 (renderer) all being in place.

## Routes

| Path                                  | Page                      | Purpose                                                       |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `/food/recipes`                       | `RecipeListPage`          | List + search + filter; entry point to detail and new         |
| `/food/recipes/new`                   | `RecipeNewPage`           | Start a new recipe (wraps editor with empty initial DSL)      |
| `/food/recipes/:slug`                 | `RecipeDetailPage`        | Read view of `recipes.current_version_id` (renderer)          |
| `/food/recipes/:slug/v/:versionNo`    | `RecipeVersionDetailPage` | Read view of a specific historical version                    |
| `/food/recipes/:slug/edit`            | `RecipeEditPage`          | Edit `recipes.current_version_id` (creates new draft on save) |
| `/food/recipes/:slug/drafts`          | `RecipeDraftsPage`        | List of draft versions; per-row "Edit" / "Promote" / "Delete" |
| `/food/recipes/:slug/drafts/:draftNo` | `RecipeDraftEditPage`     | Edit a specific existing draft                                |

Slug-based URLs (not numeric IDs) because slugs are stable identifiers (PRD-106) and human-readable in the URL bar. Internal navigation uses slug; tRPC procedures accept both slug and id (for completeness, but slug is the documented path).

## Page Specifications

### `/food/recipes` — List

- Header: "Recipes" + "+ New" button → `/food/recipes/new`.
- Search box: filters by title (case-insensitive substring) and by slug (exact prefix). Debounced 200ms.
- Filter chips above the list:
  - `recipe_type`: plate / component / technique / sauce / dressing / drink / condiment (multi-select).
  - Tag picker (multi-select from `recipe_tags`).
  - "Show archived" toggle (default off).
- Each list row: a lightweight `RecipeListCard` component (NOT PRD-121's renderer — the renderer requires `compile_status='compiled'` and joins are expensive at list scale). The card shows: hero thumbnail (`hero-card.webp`), title, prep + cook time, servings, recipe_type chip, tag chips. Rows for recipes without `current_version_id` show a "Draft only — no published version" state with an "Open drafts" link. Card data comes from `food.recipes.list` (see API).
- Empty state: encouraging "+ Create your first recipe" CTA.
- Sort dropdown: created date (default desc), title (alphabetical), recently cooked (uses `recipe_runs.completed_at` JOIN, future-proof for Epic 05).
- Pagination via cursor (React Query infinite scroll); 20 per page.

### `/food/recipes/new` — Create

- Header: "New recipe".
- PRD-120's `DslEditor` mounted with `initialValue=""`. Bottom of editor: "Save as draft" button.
- On first save:
  - Parse `body_dsl` to extract `slug` from `@recipe(slug="...", ...)`. If missing or invalid → inline error, no save.
  - Call `food.recipes.create({ dsl })` tRPC procedure (see API below).
  - Server runs `createRecipe` (PRD-107) which registers the slug in `slug_registry`; then `createNewVersion` writes the draft `recipe_versions` row; then `compileRecipeVersion` runs (PRD-116). All in one transaction.
  - On success, redirect to `/food/recipes/:slug/edit` (now editing the just-created draft).
  - On failure, errors fed back to the editor as squiggles + a side panel listing each error with file location.
- No promote affordance on the new page — promote is a separate action after a successful compile and review (see edit page).

### `/food/recipes/:slug` — Detail

- Fetches `food.recipes.getForRendering({ slug })` which assembles `RecipeVersionWithCompiledData` (see PRD-121).
- Renders PRD-121's `RecipeRenderer variant='detail'` with the data.
- Top-right action menu: "Edit" (→ edit page), "Drafts" (→ drafts page; shows badge with count), "Archive" (with confirm dialog).
- If `recipes.current_version_id` is null (no published version), shows a banner: "This recipe has no published version. Open drafts to edit."
- If `recipes.archived_at` is set, the archive banner shows (already in PRD-121's renderer).

### `/food/recipes/:slug/edit` — Edit current

- Forks behavior:
  - If `current_version_id` exists AND its status is `current`: clicking "Edit" creates a **new draft** version (via `createNewVersion`) copying `body_dsl` from the current one. The edit page opens that new draft.
  - The page URL stays `/edit` — it always edits the **latest** draft, not a specific draft number. To edit a specific draft, use `/drafts/:draftNo`.
- PRD-120's `DslEditor` mounted with the draft's `body_dsl`.
- Save button: compile + save in one transaction. Errors surface inline.
- Promote button: enabled iff `compile_status='compiled'`. Calls `food.recipes.promote({ slug, versionId })`. On success, redirects to `/food/recipes/:slug`.
- Discard button: archives the draft (PRD-107's `archiveVersion` with the reject path — `status='draft' → 'archived'`). Row disappears from the drafts list (which filters `status='draft'`).

### `/food/recipes/:slug/v/:versionNo` — Specific version

- Read-only renderer for the chosen version (any status).
- Top bar shows: "Viewing version N (status: archived/current/draft). Created: date."
- Action: "Restore as new draft" — creates a new draft copying this version's `body_dsl`. (Provides a path to roll back without losing history.)

### `/food/recipes/:slug/drafts` — Draft list

- List of all `recipe_versions` for this recipe with `status='draft'`.
- Each row shows: version number, created_at, compile_status, first ~80 chars of title-or-first-step.
- Per-row actions: "Edit" (→ `/drafts/:draftNo`), "Promote" (if compiled), "Delete".
- Empty state: "No drafts. Click 'Edit' on the recipe to start one."

### `/food/recipes/:slug/drafts/:draftNo` — Specific draft

- Same shell as the edit page but operating on the explicit draft. URL doesn't change as the user edits (no version-number bump on each save — saves overwrite the same draft row).

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (introduced when Epic 00 services land; extended here)
export const recipesRouter = {
  list: query({                                          // list page; returns lightweight rows (NOT renderer input)
    input: { search?: string, recipeTypes?: string[], tags?: string[], includeArchived?: boolean, includeDraftOnly?: boolean, cursor?: string, limit?: number },
    output: { items: RecipeListItem[], nextCursor?: string },
    // RecipeListItem = { slug, title, recipeType, heroCardPath?, prepMinutes?, cookMinutes?, servings?, tags[], hasCurrentVersion: boolean, archivedAt?: string }
  }),
  getForRendering: query({                               // detail page
    input: { slug: string, versionNo?: number },         // versionNo omitted → current_version_id
    output: RecipeVersionWithCompiledData,
  }),
  create: mutation({                                     // new page first save
    input: { dsl: string },
    output: { slug: string, versionId: number, compile: CompileResult },
  }),
  createNewDraft: mutation({                             // 'Edit' on a current recipe → new draft
    input: { slug: string },
    output: { versionId: number, versionNo: number },
  }),
  saveDraft: mutation({                                  // save on edit page
    input: { versionId: number, dsl: string },
    output: { compile: CompileResult },
  }),
  promote: mutation({                                    // promote draft → current
    input: { versionId: number },
    output: { ok: true } | { ok: false, reason: string },
  }),
  archiveVersion: mutation({                             // discard a draft
    input: { versionId: number },
    output: { ok: true },
  }),
  archiveRecipe: mutation({                              // archive whole recipe
    input: { slug: string },
    output: { ok: true },
  }),
  listDrafts: query({                                    // drafts page
    input: { slug: string },
    output: { drafts: RecipeDraftSummary[] },
  }),
  restoreVersion: mutation({                             // 'Restore as new draft' on historic version page
    input: { sourceVersionId: number },
    output: { newVersionId: number, newVersionNo: number },
  }),
  listProposedSlugs: query({                             // fed to PRD-120's editor as severity='info' issues
    input: { versionId: number },
    output: { items: ProposedSlugRow[] },
    // ProposedSlugRow = { slug, suggestedKind, fromLoc: SourceSpan, createdAt }
  }),
};
```

All mutations are transactional. `create`, `createNewDraft`, `saveDraft`, `promote`, `archiveVersion`, `archiveRecipe`, `restoreVersion` wrap a Drizzle `db.transaction` block.

`saveDraft` flow:

1. Verify `versionId` exists AND status is `draft` (else `CannotEditPublishedVersion`).
2. UPDATE `recipe_versions SET body_dsl = ?` for that id.
3. Call `compileRecipeVersion(versionId, db)` (PRD-116).
4. Return the `CompileResult` so the editor can show errors / proposed slugs.

`promote` flow:

1. Verify version's `compile_status='compiled'` (else `CannotPromoteUncompiledVersion`).
2. Call PRD-107's `promoteVersion(versionId)` service which archives the prior current in the same transaction.

`create` flow combines the above: parse DSL to extract `slug`, call `createRecipe`, `createNewVersion`, `saveDraft` (which compiles).

## Business Rules

- All routes require the `food` module to be installed (per PRD-118 manifest).
- URL slugs are case-sensitive, exactly matching `recipes.slug`. If a stale URL is visited (slug renamed), the server responds with a redirect to the new slug.
- Save-on-edit always creates a new compile attempt. Saves don't preserve a stable "I'm working on this" state between sessions — auto-save is deferred (a future enhancement).
- "Edit" on a published recipe always creates a new draft (PRD-107's rule that published versions are immutable). Re-clicking "Edit" before saving the new draft re-uses it (no proliferation).
- Promote is **one-way** in the UI: there's no "demote" button. To revert to a previous version, use "Restore as new draft" from the historic version page.
- Search results respect tag CHECK COLLATE NOCASE (PRD-107's `idx_recipe_tags_tag`) — searching for "Vegan" matches `vegan`.
- The list page has TWO independent visibility toggles: "Show archived" (default off; controls `recipes.archived_at IS NOT NULL`) and "Show draft-only" (default off; controls recipes whose `current_version_id IS NULL`). The defaults reduce noise; published-and-active is the default surface. Combine with the type/tag filters.

## Edge Cases

| Case                                                                                        | Behaviour                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| User opens `/food/recipes/new`, types DSL, navigates away without saving                    | Edit is lost (no auto-save in v1). A "Discard?" confirm on navigate-away covers accidents.                                                     |
| User saves a draft that compiles but produces 5 auto-created ingredients                    | Save succeeds; banner notifies "5 new ingredients created" with link to `/food/data` to refine names.                                          |
| Two users edit the same draft from two browsers                                             | Last write wins. Single-user POPS; rare. No optimistic locking in v1.                                                                          |
| User tries to promote a failed-compile draft                                                | Promote button is disabled; tooltip explains; backend `promote` mutation rejects defensively.                                                  |
| User archives the only recipe with no current_version_id                                    | Recipe archives; drafts persist but become unreachable from the published-list path. Drafts page still works.                                  |
| Slug in the DSL `@recipe(slug=...)` doesn't match the URL slug on save                      | If editing, the slug in DSL is the source of truth; backend may rename via `renameRecipeSlug` and redirect. If creating, the new slug is used. |
| User types a slug into `@recipe(slug=...)` that collides with an ingredient slug            | Compile fails with `SlugAlreadyRegisteredError`; surfaced as a parse-time error in the editor.                                                 |
| URL has versionNo that doesn't exist                                                        | 404 with link back to `/food/recipes/:slug`.                                                                                                   |
| User clicks "Restore as new draft" from a version that itself failed compile                | Allowed — the restored draft starts as `compile_status='uncompiled'`; user re-saves to recompile.                                              |
| Saving a draft fails at compile due to a `creation` collision (slug taken since resolution) | Transaction rolls back; editor shows the collision error and which slug. User edits and retries.                                               |

## Acceptance Criteria

Inline per theme protocol.

### Pages

- [x] All seven routes from the table above mounted in `packages/app-food/src/routes.tsx`. (119-A: real route for list; placeholder for B/C/D until those PRs land.)
- [x] Each page component lives in `packages/app-food/src/pages/` and is a thin wrapper around hooks + the editor/renderer components. (119-A: list page only; B/C/D follow.)
- [x] List page renders compact recipe cards with working search and filter. (119-A)
- [ ] New page saves a recipe end-to-end: type valid DSL → click save → redirected to edit page → recipe appears in the list.
- [ ] Detail page renders the cookbook view for sample recipes from PRD-113's seed.
- [ ] Edit page wraps PRD-120's editor with save/promote/discard controls.
- [ ] Drafts page lists drafts with per-row actions; promote moves a draft to current and archives the prior current.

### tRPC procedures

- [ ] All procedures listed in the API section exist in `apps/pops-api/src/modules/food/router.ts`.
- [ ] All mutations run in a single Drizzle transaction.
- [ ] `saveDraft` returns the `CompileResult` (success or errors) so the editor can show feedback.
- [ ] `create` parses DSL to extract the slug; rejects with `MissingRecipeHeader` if absent.
- [ ] All procedures have Vitest integration tests against an in-memory DB seeded with PRD-113 data.

### Flows

- [ ] **New recipe end-to-end**: open `/food/recipes/new`, paste a valid sample DSL, save → land on `/food/recipes/<slug>/edit` → promote → `/food/recipes/<slug>` shows the rendered recipe.
- [ ] **Edit a current recipe**: open detail of a current recipe, click Edit → new draft created → editor shows the body → save → compile errors (if any) appear inline → promote → detail page shows the new content.
- [ ] **Discard a draft**: drafts page → click Discard on a draft → confirm → `archiveVersion` runs → row disappears from the drafts list.
- [ ] **Restore historic version**: open `/food/recipes/:slug/v/2` → "Restore as new draft" → land on `/food/recipes/:slug/edit` with that version's DSL → save → promote.

### Auto-create surfacing

- [ ] When a save triggers auto-creation of ingredients/variants (via PRD-115/116 `creations` flow), the editor's response shows a banner listing the created entities with links to `/food/data?focus=<slug>`.
- [ ] The banner is dismissible; not persistent.

### Mobile

- [ ] List page is readable at 375px; cards stack single-column.
- [ ] Detail page renders at 375px without horizontal scroll.
- [ ] Edit page on mobile uses PRD-120's mobile editor mode (autocomplete in bottom drawer).
- [ ] All action menus are tappable (44px minimum target size).

### Tests

- [ ] Vitest + RTL suite at `packages/app-food/src/pages/__tests__/*.test.tsx` covers each page with happy-path + key error states.
- [ ] Vitest integration suite at `apps/pops-api/src/modules/food/__tests__/recipes-router.test.ts` covers each tRPC procedure.
- [ ] E2E flow test (in `apps/pops-shell/e2e/` if Playwright is set up, otherwise deferred): the New → Edit → Promote → Detail flow runs end-to-end against a real shell + API.

## Out of Scope

- Recipe duplication ("copy this recipe to a new slug") — defer to a follow-up enhancement.
- Auto-save / unsaved-changes warning beyond the basic browser navigate-away dialog.
- Optimistic locking for concurrent edits — single-user system.
- Recipe import via the New page (e.g. paste an Instagram URL on the new page) — Epic 02 introduces a separate ingest entry point.
- Bulk archive / bulk delete — out of scope; one-at-a-time is fine for v1.
- Recipe export (download as `.recipe` file) — deferred. The `.recipe` extension convention from ADR-023 is documented but no export UI in v1.
- Recipe sharing / public links — single-user.
- Comment threads / review notes per version — out of scope.
- Recipe rating / favourites — out of scope.

## Subsequent amendments

Pointers — not a spec change; the items below are downstream PRDs that extend this PRD's surface. Implementation reads them as a unit.

- **PRD-142** (Recipe → shopping list): action menu gains "Send to shopping list..."; introduces a `RecipeScaleProvider` React context on `RecipeDetailPage` + a `useRecipeScale()` hook exported from `@pops/app-food`; adds `food.recipes.prepareSendToList` + `food.recipes.sendToList` procedures.
- **PRD-144** (Cook event recording): action menu gains "Cook now..."; the cook modal mounts under the same `RecipeScaleProvider`.
- **Canonical final action-menu order**: Edit / Drafts / Cook now... / Send to shopping list... / Archive.
