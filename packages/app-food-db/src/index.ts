/**
 * Backend-safe barrel for the food domain's persistence layer.
 *
 * `@pops/app-food-db` was split out of `@pops/app-food` so the backend
 * (pops-api, food ingestion worker) can import services and schema
 * without pulling React-bound app code — and to break a turbo build
 * cycle that closed through `@pops/api-client` and `@pops/navigation`.
 *
 * The frontend `@pops/app-food` package depends on this one for its
 * DSL resolver, cycle detector, and ingest-eviction job — code that
 * was always backend-shaped even when it lived in the app package.
 */
export * from './errors.js';
export * from './schema.js';
export * from './slug.js';

// Drizzle handle type — re-exported so consumers don't have to reach
// into the internal services module.
export type { FoodDb } from './services/internal.js';
export { MAX_INGREDIENT_DEPTH } from './services/internal.js';

// Service namespaces — each module's free functions are exposed as a
// namespace so the API router code stays self-documenting at call sites.
export * as aliasesService from './services/aliases.js';
export * as aliasesQueries from './services/aliases-queries.js';
export * as batchesService from './services/batches.js';
export * as batchesLifecycleService from './services/batches-lifecycle.js';
export * as ingestSourcesService from './services/ingest-sources.js';
export * as inboxService from './services/inbox.js';
export * as inboxQueries from './services/inbox-queries.js';
export * as ingredientsService from './services/ingredients.js';
export * as ingredientsQueries from './services/ingredients-queries.js';
export * as ingredientTagsService from './services/ingredient-tags.js';
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
export * as conversionsService from './services/conversions.js';
export * as conversionsQueries from './services/conversions-queries.js';
export * as creationsService from './services/creations.js';

// PRD-137 — Review quality heuristic (pure function) + batched input
// gatherer. Top-level re-exports because PRD-134 / PRD-135 consume these
// directly from the barrel.
export {
  scoreDraft,
  SIGNAL_WEIGHTS,
  type CompileStatus,
  type IngestKind as QualityIngestKind,
  type IngestState as QualityIngestState,
  type QualityBand,
  type QualityInputs,
  type QualityResult,
  type QualitySignal,
  type QualitySignalCode,
} from './inbox/quality.js';
export { gatherQualityInputsForVersions } from './inbox/gather-quality-inputs.js';
export { extractPartialReasonFromExtractedJson } from './inbox/partial-reason.js';
export {
  DEFAULT_CREATION_WINDOW_SECONDS,
  countCreationsForVersion,
  countCreationsForVersions,
  listCreationsForVersion,
  type CreationRow,
  type ListCreationsOptions,
} from './services/creations.js';

// NOTE: `seedFood` is NOT re-exported here. It lives at the
// `@pops/app-food-db/seed` subpath because the seed module pulls in
// `@pops/app-lists-db` at runtime via `seed/step-lists.ts`. Re-exporting
// from the root would force every consumer of `@pops/app-food-db`
// (notably the pops-api routers in production) to eagerly evaluate the
// seed — keeping it on a subpath isolates the dependency to the CLI +
// vitest call sites that explicitly import it.

// Named result + view types — re-exported at the barrel so the tRPC
// router's inferred types in pops-api don't trip TS2883 ("the inferred
// type cannot be named without a reference to a deep import path").
export type {
  AliasWithTargetRow,
  BulkApproveAliasesResult,
  MergeAliasesResult,
} from './services/aliases.js';
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
export type {
  FailedRow,
  ListFailedFilter,
  ListPage,
  ListRejectedFilter,
  RejectedRow,
} from './services/inbox-queries.js';
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

// DSL pipeline — PRDs 114 (parser), 115 (resolver), 117 (cycle), 116 (compile),
// 123 (normalisation). Lived in `@pops/app-food/src/dsl/` until PRD-119 moved
// them here so `pops-api` can call compile / parse without dragging React +
// CodeMirror into the API bundle. `@pops/app-food` re-exports the same names
// for backwards compat (consumers like the editor + seed test fixtures keep
// their existing import paths).
export type {
  AstBlock,
  Descriptor,
  IngredientBlock,
  MarkdownBlock,
  QtyUnit,
  RecipeAst,
  RecipeHeader,
  RecipeTypeLiteral,
  SourceSpan,
  StepBlock,
  StepBody,
  StepBodyPart,
  YieldDecl,
} from './dsl/ast.js';
export type { ParseError, ParseErrorCode } from './dsl/errors.js';
export { parseRecipeDsl, type ParseResult } from './dsl/parser.js';
export { printRecipeAst } from './dsl/printer.js';
export { resolveRecipeAst } from './dsl/resolver.js';
export type {
  ProposedSlug,
  ResolveContext,
  ResolveError,
  ResolveErrorCode,
  ResolveResult,
  ResolvedBlock,
  ResolvedIngredientBlock,
  ResolvedMarkdownBlock,
  ResolvedRecipeAst,
  ResolvedStepBlock,
  ResolvedStepBody,
  ResolvedStepBodyPart,
  ResolvedYield,
  ResolverCreation,
} from './dsl/resolver-types.js';
export { detectRecipeCycle } from './dsl/cycle.js';
export type { CycleContext, CycleDescription, CycleError, CycleResult } from './dsl/cycle-types.js';
export { compileRecipeVersion } from './dsl/compile.js';
export type {
  CompileError,
  CompileErrorJson,
  CompilePhase,
  CompileResult,
  MaterialiseError,
} from './dsl/compile-types.js';
export { normaliseLineQty } from './dsl/normalisation.js';

// Wire-shape types consumed by both PRD-121's `RecipeRenderer` and PRD-119's
// `food.recipes.getForRendering` server procedure. Pure types — keep here so
// the server side stays free of any `@pops/app-food` (React) import.
export type {
  RecipeLineWithResolved,
  RecipeRendererProps,
  RecipeRendererVariant,
  RecipeVersionWithCompiledData,
} from './recipe-renderer-types.js';

// Cross-PRD type contracts for the cook / plan / fridge feature set
// (PRDs 143-147). Split by domain so each downstream PRD owns one file.
// PRD-146 shares `batches.ts` with PRD-145.
export type {
  ConsumptionNeed,
  ConsumptionOverride,
  CookPreparation,
  CookYieldDefault,
  CookYieldInput,
  MarkCookedError,
  MarkCookedResult,
  Shortfall,
} from './types/cook.js';
export type {
  PlanEntryError,
  PlanEntryMutationResult,
  PlanEntryRow,
  PlanSlotDeleteError,
  PlanSlotDeleteResult,
  PlanSlotError,
  PlanSlotMutationResult,
  PlanSlotRow,
  PlanSlotUpdateError,
  PlanSlotUpdateResult,
  ReorderSlotError,
  ReorderSlotResult,
  WeekView,
} from './types/plan.js';
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
  LineResolution,
  ManualBatchInput,
  ManualBatchSourceType,
  YieldArgs,
} from './types/batches.js';
export type {
  FridgeBatchRow,
  FridgeIngredientGroup,
  FridgeLocationSection,
  FridgeView,
  FridgeViewCounts,
  RecipeForCookRow,
} from './types/fridge.js';
