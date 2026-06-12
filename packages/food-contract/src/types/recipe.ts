/**
 * A recipe in the food pillar. Mirrors the intended API response
 * (camelCase) — the contract shape is deliberately narrower than the
 * live `RecipeListItem` (`apps/pops-api/src/modules/food/recipes/types.ts`)
 * which carries a numeric `id`, `slug`, `recipeType`, `heroImagePath`,
 * `prepMinutes`/`cookMinutes`, `archivedAt`, and a `hasCurrentVersion`
 * flag. The contract pins:
 *
 * - opaque string `id` (the runtime uses a numeric PK; the contract
 *   commits to string ids so the SDK and apps don't depend on a numeric
 *   surrogate that the back-end may someday replace),
 * - the rendered `ingredients` line list (free-form strings — the live
 *   `recipe_lines` rows are richer, but downstream consumers only need
 *   the display strings),
 * - the rendered `instructions` markdown blob,
 * - `tagIds` for tag references,
 * - a nullable `source` URL/citation string.
 */
export interface Recipe {
  id: string;
  name: string;
  /**
   * Rendered ingredient lines. Empty array when the recipe has none.
   * Order is preserved from the source row.
   */
  ingredients: readonly string[];
  instructions: string;
  /**
   * Stable identifiers for the tags attached to this recipe. Empty array
   * when the recipe has no tags. Order is preserved from the source row.
   */
  tagIds: readonly string[];
  source: string | null;
  /** ISO-8601 timestamp. Validated by `RecipeSchema` via `.datetime()`. */
  lastEditedTime: string;
}
