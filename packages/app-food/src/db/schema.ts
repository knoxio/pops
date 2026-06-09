/**
 * Local re-export of the food domain tables.
 *
 * Canonical definitions live in `@pops/db-types/src/schema/food.ts` so the
 * drizzle-kit config (which globs `packages/db-types/src/schema/*`) picks
 * them up and the rest of the platform sees a single schema barrel.
 *
 * Services in this package import from here for ergonomics and so that
 * the food module's read surface stays self-describing.
 */
export {
  batchConsumptions,
  batches,
  ingredientAliases,
  ingredients,
  ingredientVariants,
  prepStates,
  recipeRuns,
  recipes,
  recipeTags,
  recipeVersions,
  slugRegistry,
} from '@pops/db-types';
export type {
  BatchConsumptionInsert,
  BatchConsumptionRow,
  BatchInsert,
  BatchRow,
  IngredientAliasInsert,
  IngredientAliasRow,
  IngredientInsert,
  IngredientRow,
  IngredientVariantInsert,
  IngredientVariantRow,
  PrepStateInsert,
  PrepStateRow,
  RecipeInsert,
  RecipeRow,
  RecipeRunInsert,
  RecipeRunRow,
  RecipeTagInsert,
  RecipeTagRow,
  RecipeVersionInsert,
  RecipeVersionRow,
  SlugRegistryInsert,
  SlugRegistryRow,
} from '@pops/db-types';
