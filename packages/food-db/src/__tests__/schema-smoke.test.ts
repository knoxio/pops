/**
 * Smoke test that the relocated food schemas (PRD-245 US-05 / audit H6)
 * resolve from `@pops/food-db` with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-05-relocate-food-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  batchConsumptions,
  batches,
  ingestSources,
  ingredientAliases,
  ingredients,
  ingredientTags,
  ingredientVariants,
  ingredientWeights,
  planEntries,
  planSlots,
  prepStates,
  recipeLines,
  recipeRuns,
  recipes,
  recipeSteps,
  recipeTags,
  recipeVersionProposedSlugs,
  recipeVersionRejections,
  recipeVersions,
  slugRegistry,
  substitutions,
  unitConversions,
} from '../schema.js';

describe('PRD-245 US-05 food schema relocation', () => {
  it.each([
    [batchConsumptions, 'batch_consumptions'],
    [batches, 'batches'],
    [ingestSources, 'ingest_sources'],
    [ingredientAliases, 'ingredient_aliases'],
    [ingredients, 'ingredients'],
    [ingredientTags, 'ingredient_tags'],
    [ingredientVariants, 'ingredient_variants'],
    [ingredientWeights, 'ingredient_weights'],
    [planEntries, 'plan_entries'],
    [planSlots, 'plan_slots'],
    [prepStates, 'prep_states'],
    [recipeLines, 'recipe_lines'],
    [recipeRuns, 'recipe_runs'],
    [recipes, 'recipes'],
    [recipeSteps, 'recipe_steps'],
    [recipeTags, 'recipe_tags'],
    [recipeVersionProposedSlugs, 'recipe_version_proposed_slugs'],
    [recipeVersionRejections, 'recipe_version_rejections'],
    [recipeVersions, 'recipe_versions'],
    [slugRegistry, 'slug_registry'],
    [substitutions, 'substitutions'],
    [unitConversions, 'unit_conversions'],
  ])('resolves table $1 from @pops/food-db', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
