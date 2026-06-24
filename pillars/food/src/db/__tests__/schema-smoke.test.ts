/**
 * Smoke test that every food-owned table resolves from the schema barrel
 * (`../schema.ts`) with the expected drizzle SQL `name`.
 *
 * Catches "table renamed but the export forgot to flip" mistakes: the set
 * covers every food-owned table, so a name drift on either side trips here.
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

describe('food schema barrel table names', () => {
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
  ])('resolves table $1 from the schema barrel', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
