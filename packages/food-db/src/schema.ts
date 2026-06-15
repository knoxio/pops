/**
 * Food domain table barrel.
 *
 * Canonical definitions for food-owned tables (ingredients, variants,
 * recipes, recipe versions/runs/steps/lines, batches, plan slots/entries,
 * ingest sources, substitutions, unit conversions, ingredient/recipe
 * tags, slug registry, recipe-version rejections, prep states) live in
 * this package per PRD-245 US-05 (audit H6/H7).
 *
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
