# Idea: Recipe Tag Management & Merge

Status: **Idea** — not built. The `recipe_tags` table (PK `(recipe_id, tag)`, `COLLATE NOCASE` index on `tag`) exists and is read-only on the API surface: `/recipes/search` accepts a `tags` filter and the rendering payload returns a recipe's tags. There is no service function or REST endpoint that creates, edits, or deletes a recipe's tags, and no curation/dedup tooling.

## Problem

Tags are free-form and high-churn. Without a write path and curation tooling:

- Recipes can't be tagged through the app at all (tags only land via whatever back-channel populates the table).
- Near-duplicate tags accumulate (`vegan` vs `plant-based`, `bbq` vs `barbecue`) with no schema-level or UI-level dedup.

## Proposed Scope

1. **Tag write service + endpoints**
   - `setRecipeTags(recipeId, tags[])` (replace) and/or `addRecipeTag` / `removeRecipeTag`, all transactional on `recipe_tags`. Tags belong to the recipe (stable identity), not the version — a tag change must not bump a version.
   - REST: e.g. `PUT /recipes/:slug/tags` (replace set) or `POST` / `DELETE /recipes/:slug/tags/:tag`.
   - Case-preserve on write; rely on the existing `idx_recipe_tags_tag COLLATE NOCASE` for case-insensitive lookups and to reject case-variant duplicates of the same tag.

2. **Tag taxonomy / merge tooling**
   - A list-all-tags-with-counts query.
   - A merge operation: `mergeTags(from, into)` that rewrites every `recipe_tags` row, dedupes against the `(recipe_id, tag)` PK, and removes the orphaned source tag.
   - Optional UI to surface candidate duplicates and drive the merge.

## Constraints to preserve

- No `slug_registry` involvement — tags are deliberately not DSL-referenceable.
- A tag mutation must never create a new `recipe_version`.
- The `(recipe_id, tag)` PK and the NOCASE index already enforce per-recipe uniqueness; the write path must surface a clean no-op (or typed error) on a duplicate rather than crashing.
