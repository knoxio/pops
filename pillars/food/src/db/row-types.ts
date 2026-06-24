/**
 * `Row`/`Insert` aliases for the food-owned tables.
 *
 * Centralised here so in-pillar consumers can `import type { IngredientRow }`
 * from the db barrel (`./index.js`) without reaching into a service module.
 * The underlying tables live in `./schema/*.ts`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  batchConsumptions,
  batches,
  ingestSources,
  ingredientAliases,
  ingredientTags,
  ingredientVariants,
  ingredientWeights,
  ingredients,
  planEntries,
  planSlots,
  prepStates,
  recipeLines,
  recipeRuns,
  recipeSteps,
  recipeTags,
  recipeVersionProposedSlugs,
  recipeVersionRejections,
  recipeVersions,
  recipes,
  slugRegistry,
  substitutions,
  unitConversions,
} from './schema.js';

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

export type IngredientTagRow = InferSelectModel<typeof ingredientTags>;
export type IngredientTagInsert = InferInsertModel<typeof ingredientTags>;

export type RecipeRow = InferSelectModel<typeof recipes>;
export type RecipeInsert = InferInsertModel<typeof recipes>;

export type RecipeVersionRow = InferSelectModel<typeof recipeVersions>;
export type RecipeVersionInsert = InferInsertModel<typeof recipeVersions>;

export type RecipeTagRow = InferSelectModel<typeof recipeTags>;
export type RecipeTagInsert = InferInsertModel<typeof recipeTags>;

export type BatchRow = InferSelectModel<typeof batches>;
export type BatchInsert = InferInsertModel<typeof batches>;

export type RecipeRunRow = InferSelectModel<typeof recipeRuns>;
export type RecipeRunInsert = InferInsertModel<typeof recipeRuns>;

export type BatchConsumptionRow = InferSelectModel<typeof batchConsumptions>;
export type BatchConsumptionInsert = InferInsertModel<typeof batchConsumptions>;

export type SubstitutionRow = InferSelectModel<typeof substitutions>;
export type SubstitutionInsert = InferInsertModel<typeof substitutions>;

export type PlanSlotRow = InferSelectModel<typeof planSlots>;
export type PlanSlotInsert = InferInsertModel<typeof planSlots>;

export type PlanEntryRow = InferSelectModel<typeof planEntries>;
export type PlanEntryInsert = InferInsertModel<typeof planEntries>;

export type IngestSourceRow = InferSelectModel<typeof ingestSources>;
export type IngestSourceInsert = InferInsertModel<typeof ingestSources>;
export type IngestSourceKind = IngestSourceRow['kind'];

export type RecipeLineRow = InferSelectModel<typeof recipeLines>;
export type RecipeLineInsert = InferInsertModel<typeof recipeLines>;

export type RecipeStepRow = InferSelectModel<typeof recipeSteps>;
export type RecipeStepInsert = InferInsertModel<typeof recipeSteps>;

export type RecipeVersionProposedSlugRow = InferSelectModel<typeof recipeVersionProposedSlugs>;
export type RecipeVersionProposedSlugInsert = InferInsertModel<typeof recipeVersionProposedSlugs>;

export type RecipeVersionRejectionRow = InferSelectModel<typeof recipeVersionRejections>;
export type RecipeVersionRejectionInsert = InferInsertModel<typeof recipeVersionRejections>;
export type RecipeVersionRejectionReason = RecipeVersionRejectionRow['reason'];

export type UnitConversionRow = InferSelectModel<typeof unitConversions>;
export type UnitConversionInsert = InferInsertModel<typeof unitConversions>;
export type CanonicalUnit = UnitConversionRow['toUnit'];

export type IngredientWeightRow = InferSelectModel<typeof ingredientWeights>;
export type IngredientWeightInsert = InferInsertModel<typeof ingredientWeights>;
