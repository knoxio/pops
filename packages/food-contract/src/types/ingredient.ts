/**
 * A canonical ingredient. Mirrors the intended API response (camelCase) for
 * the food pillar.
 *
 * The contract shape is deliberately narrower than the live ingredient
 * row in `@pops/app-food-db`, which carries a numeric primary key, a
 * canonical slug, a strict `defaultUnit` enum (`g | ml | count`), a
 * parent hierarchy, density, and free-form notes. The contract pins an
 * opaque string `id`, a nullable free-form `category` (the parent
 * ingredient surfaced as a label), and a nullable free-form `unit`. The
 * runtime persistence model can evolve underneath; this surface is what
 * downstream consumers code against.
 */
export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  /** ISO-8601 timestamp. Validated by `IngredientSchema` via `.datetime()`. */
  lastEditedTime: string;
}
