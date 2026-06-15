/**
 * Drizzle `InferSelectModel<T>` / `InferInsertModel<T>` aliases for
 * food-owned tables.
 *
 * Split out of `index.ts` (and out of the old `./food.ts`) to keep
 * that file under the file-size lint cap once `@pops/db-types`
 * re-exports the food schemas from `@pops/food-db` (PRD-245 US-05).
 * Public surface stays unchanged: `index.ts` re-exports
 * `* from './food-types.js'`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
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
} from '@pops/food-db';

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

// PRD-151
export type IngredientTagRow = InferSelectModel<typeof ingredientTags>;
export type IngredientTagInsert = InferInsertModel<typeof ingredientTags>;

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

// PRD-111
export type PlanSlotRow = InferSelectModel<typeof planSlots>;
export type PlanSlotInsert = InferInsertModel<typeof planSlots>;
export type PlanEntryRow = InferSelectModel<typeof planEntries>;
export type PlanEntryInsert = InferInsertModel<typeof planEntries>;

// PRD-110
export type IngestSourceRow = InferSelectModel<typeof ingestSources>;
export type IngestSourceInsert = InferInsertModel<typeof ingestSources>;
export type IngestSourceKind = IngestSourceRow['kind'];

// PRD-116
export type RecipeLineRow = InferSelectModel<typeof recipeLines>;
export type RecipeLineInsert = InferInsertModel<typeof recipeLines>;
export type RecipeStepRow = InferSelectModel<typeof recipeSteps>;
export type RecipeStepInsert = InferInsertModel<typeof recipeSteps>;
export type RecipeVersionProposedSlugRow = InferSelectModel<typeof recipeVersionProposedSlugs>;
export type RecipeVersionProposedSlugInsert = InferInsertModel<typeof recipeVersionProposedSlugs>;

// PRD-136
export type RecipeVersionRejectionRow = InferSelectModel<typeof recipeVersionRejections>;
export type RecipeVersionRejectionInsert = InferInsertModel<typeof recipeVersionRejections>;
export type RecipeVersionRejectionReason = RecipeVersionRejectionRow['reason'];

// PRD-123
export type UnitConversionRow = InferSelectModel<typeof unitConversions>;
export type UnitConversionInsert = InferInsertModel<typeof unitConversions>;
export type CanonicalUnit = UnitConversionRow['toUnit'];
export type IngredientWeightRow = InferSelectModel<typeof ingredientWeights>;
export type IngredientWeightInsert = InferInsertModel<typeof ingredientWeights>;
