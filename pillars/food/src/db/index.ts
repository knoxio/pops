/**
 * Internal barrel for the food pillar's persistence layer.
 *
 * PRIVATE to the pillar — never exported from `@pops/food`'s public
 * surface. The `api/` and `worker/` subdirs import services and types
 * from here via relative paths.
 */
export * from './errors.js';
export * from './row-types.js';
export * from './schema.js';

export { openFoodDb, type OpenedFoodDb } from './open-food-db.js';

export { MAX_INGREDIENT_DEPTH, type FoodDb } from './services/internal.js';

// Service namespaces — each module's free functions are exposed as a
// namespace so callers stay self-documenting.
export * as aliasesService from './services/aliases.js';
export * as aliasesQueries from './services/aliases-queries.js';
export * as batchesService from './services/batches.js';
export * as batchesLifecycleService from './services/batches-lifecycle.js';
export * as conversionsService from './services/conversions.js';
export * as conversionsQueries from './services/conversions-queries.js';
export * as creationsService from './services/creations.js';
export * as ingestSourcesService from './services/ingest-sources.js';
export * as ingredientsService from './services/ingredients.js';
export * as ingredientsQueries from './services/ingredients-queries.js';
export * as ingredientTagsService from './services/ingredient-tags.js';
export * as inboxService from './services/inbox.js';
export * as inboxQueries from './services/inbox-queries.js';
export * as inboxInspectorService from './services/inbox-inspector.js';
export type * from './services/inbox-inspector.js';
export * as planService from './services/plan.js';
export * as prepStatesService from './services/prep-states.js';
export * as recipeRunsService from './services/recipe-runs.js';
export * as recipeVersionsService from './services/recipe-versions.js';
export * as recipesService from './services/recipes.js';
export * as slugSearchService from './services/slug-search.js';
export * as substitutionsService from './services/substitutions.js';
export * as substitutionsQueries from './services/substitutions-queries.js';
export * as substitutionsGraph from './services/substitutions-graph.js';
export * as substitutionsHydrate from './services/substitutions-hydrate.js';
export * as variantsService from './services/variants.js';

// Named result + view types — re-exported so consumers can name the
// tRPC router's inferred types without reaching for deep import paths.
export {
  DEFAULT_CREATION_WINDOW_SECONDS,
  countCreationsForVersion,
  countCreationsForVersions,
  listCreationsForVersion,
  type CreationRow,
  type ListCreationsOptions,
} from './services/creations.js';
export type {
  AliasWithTargetRow,
  BulkApproveAliasesResult,
  MergeAliasesResult,
} from './services/aliases.js';
// Batch + fridge domain view types — re-exported so the api-layer
// resolvers (batches/fridge) can name them via the db barrel.
export type {
  BatchAdjustReason,
  BatchAdjustResult,
  BatchDetail,
  BatchEditPatch,
  BatchError,
  BatchForConsumeRow,
  BatchLocation,
  BatchMutationResult,
  BatchSourceType,
  BatchUnit,
  ManualBatchInput,
  ManualBatchSourceType,
} from '../domain/types/batches.js';
export type {
  FridgeBatchRow,
  FridgeIngredientGroup,
  FridgeLocationSection,
  FridgeView,
  FridgeViewCounts,
  RecipeForCookRow,
} from '../domain/types/fridge.js';
export type {
  ApproveRejectError,
  ApproveRejectFailure,
  ApproveResult,
  ApproveSuccess,
  RejectInput,
  RejectResult,
  RejectSuccess,
  RejectionReason,
  UnrejectResult,
  UnrejectSuccess,
} from './services/inbox.js';
export type * from './services/inbox-queries.js';
export type { PromoteVersionResult } from './services/recipe-versions.js';
export type {
  DeleteBlockerSummary,
  RecipeRefRow,
  RecipeRefsSummary,
} from './services/ingredients-queries.js';
export type {
  IngredientSummary,
  TagDistinctRow,
  TagErrorCode,
  TagOpResult,
} from './services/ingredient-tags.js';
export type { SlugMatch } from './services/slug-search.js';
export type { SubstitutionScope, SubstitutionView } from './services/substitutions-queries.js';
export type {
  GraphViewEdgeRow,
  GraphViewFilter,
  GraphViewResult,
  GraphViewSide,
} from './services/substitutions-graph.js';
export type {
  HydratedEndpoint,
  HydratedSubstitutionView,
} from './services/substitutions-hydrate.js';
