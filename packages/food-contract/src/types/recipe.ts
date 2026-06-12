/**
 * Pilot entity for `@pops/food-contract`. This is a deliberate stub
 * shape — id/name/servings/lastEditedTime — sized to exercise the
 * round-trip tests + manifest + OpenAPI generators without committing
 * the contract to the full surface of the live
 * `apps/pops-api/src/modules/food/recipes/types.ts` `RecipeListItem`
 * type (slug, recipeType, heroImagePath, prepMinutes/cookMinutes, tags,
 * archived flag, etc.). The production shape migrates in a follow-up
 * PRD-153 US-07-style content migration for food.
 *
 * `lastEditedTime` is an ISO-8601 timestamp validated by `RecipeSchema`
 * via `.datetime()`. `servings` is nullable to match the live shape
 * (recipes without a serving target).
 */
export interface Recipe {
  id: string;
  name: string;
  servings: number | null;
  /** ISO-8601 timestamp. Validated by `RecipeSchema` via `.datetime()`. */
  lastEditedTime: string;
}
