# Recipe CRUD Pages

Status: Done. The recipe-facing pages under `/food/recipes/*` and the `recipes.*` REST endpoints that back them are shipped. Missing/forward-looking pieces (stale-slug redirect, "recently cooked" sort, mobile editor drawer, e2e flow test, duplication, auto-save, export) live in `../../ideas/recipe-crud-extensions.md`.

The recipe CRUD surface integrates the DSL editor (write) and the recipe renderer (read) into a working create / edit / promote / archive experience over the recipe versioning model. URLs are slug-based (stable, human-readable). The pages are thin React wrappers around query/mutation hooks and the editor/renderer components; all data flows through the food pillar's `recipes.*` ts-rest contract.

## Data model

Three tables in the food pillar's SQLite DB:

- `recipes` — stable identity: `id`, `slug` (unique), `recipe_type` (plate / component / technique / sauce / dressing / drink / condiment, default plate), `current_version_id` (FK to `recipe_versions`, nullable), `hero_image_path`, `archived_at`, `created_at`.
- `recipe_versions` — content snapshots: `id`, `recipe_id`, `version_no` (unique per recipe), `status` (draft / current / archived), `title`, `summary`, `body_dsl`, yield fields, `servings`, `prep_minutes`, `cook_minutes`, `source_id`, `compile_status` (uncompiled / compiled / failed), `compile_error`, `compiled_at`, `created_at`. At most one `current` version per recipe (partial UNIQUE in migration).
- `recipe_tags` — `(recipe_id, tag)` primary key; tag index is `COLLATE NOCASE` so tag filters are case-insensitive.

## Routes

| Path                                  | Page                      | Purpose                                                   |
| ------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `/food/recipes`                       | `RecipeListPage`          | List + search + filter; entry to detail and new           |
| `/food/recipes/new`                   | `RecipeNewPage`           | Start a new recipe (editor with empty DSL)                |
| `/food/recipes/:slug`                 | `RecipeDetailPage`        | Read view of the current version (renderer)               |
| `/food/recipes/:slug/v/:versionNo`    | `RecipeVersionDetailPage` | Read view of a specific historical version                |
| `/food/recipes/:slug/edit`            | `RecipeEditPage`          | Edit latest draft (forks a draft if current is published) |
| `/food/recipes/:slug/drafts`          | `RecipeDraftsPage`        | List draft versions; per-row Edit / Promote / Delete      |
| `/food/recipes/:slug/drafts/:draftNo` | `RecipeDraftEditPage`     | Edit a specific existing draft                            |

## REST API surface

ts-rest contract `recipes.*` (`src/contract/rest-recipes.ts`), mounted under the food pillar:

| Endpoint                                          | Purpose                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST /recipes/search`                            | List page: filtered, cursor-paginated lightweight rows                   |
| `POST /recipes`                                   | Create a recipe from DSL → `{ slug, recipeId, versionId, compile }`      |
| `GET /recipes/:slug?versionNo=`                   | Detail: assemble a version for rendering (`versionNo` omitted → current) |
| `GET /recipes/:slug/drafts`                       | List a recipe's draft versions                                           |
| `POST /recipes/:slug/drafts`                      | Fork a new draft from the current version                                |
| `POST /recipes/:slug/archive`                     | Archive the whole recipe                                                 |
| `PATCH /recipes/versions/:versionId`              | Save + compile a draft → `{ compile }`                                   |
| `POST /recipes/versions/:versionId/promote`       | Promote a compiled draft to current                                      |
| `POST /recipes/versions/:versionId/archive`       | Archive (discard) a draft version                                        |
| `POST /recipes/versions/:versionId/restore`       | Restore an archived/published version as a new draft                     |
| `GET /recipes/versions/:versionId/proposed-slugs` | Slugs surfaced by a draft's compile (auto-create banner)                 |

`POST /recipes/search` returns lightweight `RecipeListItem` rows (`{ id, slug, title, recipeType, heroImagePath, prepMinutes, cookMinutes, servings, tags[], hasCurrentVersion, archivedAt, createdAt }`) — NOT the renderer aggregate, which joins are too expensive at list scale. `GET /recipes/:slug` returns the renderer's `RecipeVersionWithCompiledData` aggregate. `promote` returns a discriminated `{ ok }` result with a typed `reason` on failure.

## Page behaviour

**List** — header with "+ New" CTA; debounced (200ms) search over title (case-insensitive substring) and slug; filter chips for `recipe_type` (multi-select), tags (multi-select), and two visibility toggles: "Show archived" (default off → `archived_at IS NOT NULL`) and "Show draft-only" (default off → `current_version_id IS NULL`). Sort dropdown: created date (default desc), title (alphabetical), and "recently cooked" (rendered, but the endpoint currently falls back to created-date — see `../../ideas/recipe-crud-extensions.md`). Cursor pagination, 20/page, load-more. Compact `RecipeListCard` rows (hero thumbnail, title, prep/cook time, servings, type chip, tags) — not the renderer. Encouraging empty state.

**New** — DSL editor with an empty `@recipe(slug="", ...)` template + "Save as draft". First save parses the DSL to extract the slug and creates the recipe, draft version, and compile in one transaction; on success redirects to `/food/recipes/:slug/edit`. A DSL missing its `@recipe(slug=...)` header is rejected (`MissingRecipeHeader`) with the error surfaced in the editor; no save.

**Detail** — fetches the renderer aggregate for the current version and renders `RecipeRenderer variant='detail'`. Action menu: Edit / Drafts (with count badge) / Archive (confirm dialog). If `current_version_id` is null, a "no published version — open drafts" banner shows instead of the renderer. Generic not-found state for an unknown slug.

**Edit** — opens the latest draft of `:slug`; if the current version is published, forks a fresh draft on mount via `POST /recipes/:slug/drafts` (idempotent — re-mounting reuses the open draft, no proliferation). The URL always edits the latest draft. Save compiles in one transaction and feeds compile errors + proposed slugs back into the editor as inline issues. Promote is enabled only when the latest compile succeeded. Discard archives the draft. Hero-image upload is available inline.

**Historic version** (`/v/:versionNo`) — read-only renderer for any version; "Restore as new draft" forks this version's DSL into a new draft and navigates to `/edit`. A non-existent `versionNo` shows a not-found state.

**Drafts** — lists `status='draft'` versions with version number, created date, compile status, and a title/step preview; per-row Edit / Promote (if compiled) / Delete. Empty state.

**Specific draft** (`/drafts/:draftNo`) — same edit shell, targeting the explicit draft; saves overwrite the same draft row.

## Business rules

- URL slugs are case-sensitive and match `recipes.slug` exactly.
- All mutations (`create`, `createNewDraft`, `saveDraft`, `promote`, `archiveVersion`, `archiveRecipe`, `restoreVersion`) run in a single Drizzle transaction.
- `saveDraft` verifies the version exists and is a draft (else `CannotEditPublishedVersion`), updates `body_dsl`, recompiles, and returns the `CompileResult`.
- `promote` verifies `compile_status='compiled'` (else rejects with reason `CannotPromoteUncompiledVersion`) and archives the prior current version in the same transaction.
- "Edit" on a published recipe always creates a new draft (published versions are immutable); promote is one-way in the UI (no demote — use "Restore as new draft").
- Editing is single-user, last-write-wins; no optimistic locking, no auto-save.
- Tag filters are case-insensitive (`recipe_tags` index `COLLATE NOCASE`): searching "Vegan" matches `vegan`.
- The two list visibility toggles default off; published-and-active is the default surface, combinable with type/tag filters.

## Edge cases

- New page navigate-away without saving loses the edit (only the browser's generic dialog protects it).
- A save that auto-creates ingredients/variants surfaces them via the dismissible `AutoCreatedBanner`, sourced from `proposed-slugs`, linking to `/food/data`.
- Promoting a failed-compile draft is blocked in the UI and rejected defensively by the endpoint.
- Archiving a recipe with no current version: drafts persist (reachable via the drafts page) but the recipe drops off the published list.
- A slug collision in the DSL (`@recipe(slug=...)` taken by another entity) fails compile and surfaces as a parse-time editor error.
- A non-existent `versionNo` renders a not-found state with a path back to the recipe.
- "Restore as new draft" from a failed-compile version is allowed; the restored draft starts uncompiled and is recompiled on save.
- A compile-time slug collision rolls back the save transaction and shows the collision error.

## Acceptance criteria

Pages:

- [x] All seven routes are mounted in `app/src/routes.tsx`; each page is a thin wrapper around hooks + the editor/renderer.
- [x] List page renders compact recipe cards with working debounced search, type/tag filters, archived + draft-only toggles, sort, and cursor load-more.
- [x] New page saves a recipe end-to-end: valid DSL → save → redirect to the edit page; a DSL missing its `@recipe` header is rejected with `MissingRecipeHeader`.
- [x] Detail page renders `RecipeRenderer variant='detail'` for the current version, shows the action menu (Edit / Drafts+count / Archive), and shows the missing-version banner when `current_version_id` is null.
- [x] Edit page forks a draft on mount when the current is published, wraps the DSL editor, and exposes Save / Promote (compiled-only) / Discard with compile errors + proposed slugs surfaced inline.
- [x] Historic-version page renders read-only and offers "Restore as new draft"; an unknown `versionNo` shows a not-found state.
- [x] Drafts page lists `status='draft'` versions with per-row Edit / Promote / Delete; promote moves the draft to current and archives the prior current.

REST endpoints:

- [x] All eleven `recipes.*` endpoints exist in `src/contract/rest-recipes.ts` and are handled in `src/api/rest/recipes-handlers.ts`.
- [x] All mutations run in a single Drizzle transaction.
- [x] `saveDraft` returns the `CompileResult` so the editor can show feedback; `create` parses the DSL to extract the slug and rejects a missing header.
- [x] `promote` rejects uncompiled versions defensively with a typed reason.

Flows:

- [x] New → Edit → Promote → Detail runs end-to-end (create → navigate → edit → promote → rendered detail).
- [x] Edit a current recipe: Edit forks a draft → editor shows the body → save surfaces compile errors inline → promote updates the detail page.
- [x] Discard a draft removes it from the drafts list.
- [x] Restore a historic version lands on `/edit` with that version's DSL.
- [x] Auto-created ingredients/variants surface in a dismissible banner linking to `/food/data`.

Mobile:

- [x] List page is readable at 375px (cards stack single-column); detail page renders without horizontal scroll; action menus honour the 44px tap-target minimum.
