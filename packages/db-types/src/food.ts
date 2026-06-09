/**
 * Food-domain inferred types.
 *
 * Re-exported from `./index.ts` for ergonomic consumer imports — this file
 * is the home so `index.ts` stays under the 200-line max-lines cap as the
 * food schema grows.
 *
 * See `packages/db-types/src/schema/food.ts` for the table definitions and
 * `docs/themes/07-food/` for the per-table PRDs.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { substitutions } from './schema/food-substitutions.js';
import type {
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
} from './schema/food.js';

// PRD-106
export type SlugRegistryRow = InferSelectModel<typeof slugRegistry>;
export type SlugRegistryInsert = InferInsertModel<typeof slugRegistry>;
export type IngredientRow = InferSelectModel<typeof ingredients>;
export type IngredientInsert = InferInsertModel<typeof ingredients>;
export type IngredientVariantRow = InferSelectModel<typeof ingredientVariants>;
export type IngredientVariantInsert = InferInsertModel<typeof ingredientVariants>;
export type PrepStateRow = InferSelectModel<typeof prepStates>;
export type PrepStateInsert = InferInsertModel<typeof prepStates>;
export type IngredientAliasRow = InferSelectModel<typeof ingredientAliases>;
export type IngredientAliasInsert = InferInsertModel<typeof ingredientAliases>;

// PRD-107
export type RecipeRow = InferSelectModel<typeof recipes>;
export type RecipeInsert = InferInsertModel<typeof recipes>;
export type RecipeVersionRow = InferSelectModel<typeof recipeVersions>;
export type RecipeVersionInsert = InferInsertModel<typeof recipeVersions>;
export type RecipeTagRow = InferSelectModel<typeof recipeTags>;
export type RecipeTagInsert = InferInsertModel<typeof recipeTags>;

// PRD-108
export type BatchRow = InferSelectModel<typeof batches>;
export type BatchInsert = InferInsertModel<typeof batches>;
export type RecipeRunRow = InferSelectModel<typeof recipeRuns>;
export type RecipeRunInsert = InferInsertModel<typeof recipeRuns>;
export type BatchConsumptionRow = InferSelectModel<typeof batchConsumptions>;
export type BatchConsumptionInsert = InferInsertModel<typeof batchConsumptions>;

// PRD-109
export type SubstitutionRow = InferSelectModel<typeof substitutions>;
export type SubstitutionInsert = InferInsertModel<typeof substitutions>;
