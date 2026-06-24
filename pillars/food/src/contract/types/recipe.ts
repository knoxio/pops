/**
 * A recipe, as exposed on the food pillar API (camelCase).
 *
 * This contract surface is deliberately narrower than the persisted recipe
 * row in `src/db`. It commits to an opaque string `id` so the SDK and apps
 * don't depend on a numeric surrogate, exposes the rendered `ingredients`
 * line list and `instructions` markdown blob rather than the richer
 * underlying rows, carries `tagIds` for tag references, and a nullable
 * `source` URL/citation string.
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
