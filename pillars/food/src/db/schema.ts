/**
 * Food domain table barrel.
 *
 * Canonical definitions for food-owned tables (ingredients, variants,
 * recipes, recipe versions/runs/steps/lines, batches, plan slots/entries,
 * ingest sources, substitutions, unit conversions, ingredient/recipe
 * tags, slug registry, recipe-version rejections, prep states) live in
 * `./schema/food-*.ts` files in this directory.
 *
 * AI inference telemetry is owned by the ai pillar (via `@pops/ai-telemetry`);
 * food no longer keeps a local `ai_inference_log` table.
 */
export { batchConsumptions, batches, recipeRuns } from './schema/food-batches.js';
export { recipeLines, recipeSteps, recipeVersionProposedSlugs } from './schema/food-compile.js';
export { ingredientWeights, unitConversions } from './schema/food-conversions.js';
export { ingestSources } from './schema/food-ingest-sources.js';
export {
  ingredientAliases,
  ingredients,
  ingredientTags,
  ingredientVariants,
  prepStates,
  slugRegistry,
} from './schema/food-ingredients.js';
export { planEntries, planSlots } from './schema/food-plan.js';
export { recipes, recipeTags, recipeVersions } from './schema/food-recipes.js';
export { recipeVersionRejections } from './schema/food-rejections.js';
export { substitutions } from './schema/food-substitutions.js';

export type {
  BatchConsumptionInsert,
  BatchConsumptionRow,
  BatchInsert,
  BatchRow,
  CanonicalUnit,
  IngestSourceInsert,
  IngestSourceKind,
  IngestSourceRow,
  IngredientAliasInsert,
  IngredientAliasRow,
  IngredientInsert,
  IngredientRow,
  IngredientTagInsert,
  IngredientTagRow,
  IngredientVariantInsert,
  IngredientVariantRow,
  IngredientWeightInsert,
  IngredientWeightRow,
  PlanEntryInsert,
  PlanEntryRow,
  PlanSlotInsert,
  PlanSlotRow,
  PrepStateInsert,
  PrepStateRow,
  RecipeInsert,
  RecipeLineInsert,
  RecipeLineRow,
  RecipeRow,
  RecipeRunInsert,
  RecipeRunRow,
  RecipeStepInsert,
  RecipeStepRow,
  RecipeTagInsert,
  RecipeTagRow,
  RecipeVersionInsert,
  RecipeVersionProposedSlugInsert,
  RecipeVersionProposedSlugRow,
  RecipeVersionRejectionInsert,
  RecipeVersionRejectionRow,
  RecipeVersionRow,
  SlugRegistryInsert,
  SlugRegistryRow,
  SubstitutionInsert,
  SubstitutionRow,
  UnitConversionInsert,
  UnitConversionRow,
} from './row-types.js';
