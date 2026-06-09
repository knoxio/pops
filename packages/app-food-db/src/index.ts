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
export * as batchesService from './services/batches.js';
export * as ingestSourcesService from './services/ingest-sources.js';
export * as ingredientsService from './services/ingredients.js';
export * as ingredientsQueries from './services/ingredients-queries.js';
export * as planService from './services/plan.js';
export * as prepStatesService from './services/prep-states.js';
export * as recipeRunsService from './services/recipe-runs.js';
export * as recipeVersionsService from './services/recipe-versions.js';
export * as recipesService from './services/recipes.js';
export * as slugSearchService from './services/slug-search.js';
export * as substitutionsService from './services/substitutions.js';
export * as substitutionsQueries from './services/substitutions-queries.js';
export * as substitutionsGraph from './services/substitutions-graph.js';
export * as variantsService from './services/variants.js';
export * as conversionsService from './services/conversions.js';

// NOTE: `seedFood` is NOT re-exported here. It lives at the
// `@pops/app-food-db/seed` subpath because the seed module pulls in
// `@pops/app-lists` at runtime via `seed/step-lists.ts`. Re-exporting
// from the root would force every consumer of `@pops/app-food-db`
// (notably the pops-api routers in production) to eagerly evaluate the
// seed — and the pops-api Docker image doesn't ship `@pops/app-lists`'s
// source. Seed consumers (the `mise db:seed:food` CLI, vitest suites)
// import the subpath explicitly.

// Named result + view types — re-exported at the barrel so the tRPC
// router's inferred types in pops-api don't trip TS2883 ("the inferred
// type cannot be named without a reference to a deep import path").
export type { BulkApproveAliasesResult, MergeAliasesResult } from './services/aliases.js';
export type { DeleteBlockerSummary } from './services/ingredients-queries.js';
export type { SlugMatch } from './services/slug-search.js';
export type { SubstitutionScope, SubstitutionView } from './services/substitutions-queries.js';
export type {
  GraphViewEdgeRow,
  GraphViewFilter,
  GraphViewResult,
  GraphViewSide,
} from './services/substitutions-graph.js';
