/**
 * A canonical ingredient, as exposed on the food pillar API (camelCase).
 *
 * This contract surface is deliberately narrower than the persisted
 * ingredient row in `src/db`: `id` is an opaque string, `category` is the
 * parent ingredient surfaced as a nullable free-form label, and `unit` is
 * a nullable free-form string.
 */
export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  /** ISO-8601 timestamp. Validated by `IngredientSchema` via `.datetime()`. */
  lastEditedTime: string;
}
