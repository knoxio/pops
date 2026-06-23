# Idea: Planning Page — Version Pinning & Draft-Only Recipes

Forward-looking UI on top of the shipped planning surface (`prds/planning-page`). The REST contract already carries `recipeVersionId` on `POST /plan/entries` and `PATCH /plan/entries/:id`, the week-view row exposes `recipeVersionId`, and the server `recipeGuard` already validates that a pinned version belongs to the recipe. What is missing is purely the front-end affordances and the cell decorations.

## Version-pin dropdown (Add + Edit)

Today the Add modal and Edit sheet only expose recipe, servings, and notes — every entry is implicitly pinned to "current version" (`recipe_version_id` left NULL, resolved via `COALESCE(..., recipes.current_version_id)` at read time). Add a "Version" dropdown to both surfaces:

- Default option "Current version" → sends `recipeVersionId: undefined/null`.
- Explicit options list the recipe's versions with their version number + status (draft / current / archived).
- Edit sheet sends the chosen value through `PATCH /plan/entries/:id` (which already accepts `recipeVersionId`, nullable to reset to current).

Requires a per-recipe version-list endpoint the picker can read (the recipe drafts/versions surface already exists under `/recipes/:slug/drafts` and `/recipes/versions/...`).

## Draft-only recipe selection

The Add modal's recipe picker searches via `POST /recipes/search` with `includeArchived: false`, and the server rejects adding a recipe with no current version (`RecipeHasNoCurrentVersion`). To plan a recipe that only has draft versions, add a "Show draft-only recipes" checkbox that surfaces those recipes and, on selection, auto-sets `recipeVersionId` to a chosen draft so the add succeeds.

## Archived-version / archived-recipe cell tags

Entries can legitimately point at an archived version (allowed when explicitly pinned) or at a recipe that was archived after planning. The week-view row carries enough to detect the version case, but the recipe-archived case needs `recipes.archived_at` surfaced in the wire row. Render a small "(archived version)" / "(archived recipe)" tag on the affected cell so stale plans are visible at a glance.

## E2E coverage

A Playwright round-trip — add three entries, drag one to a new cell, edit servings, delete one, reload and assert state — remains deferred. Component (RTL) and API integration tests exist; the browser-level flow does not.
