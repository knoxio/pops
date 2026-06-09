/**
 * @pops/app-food/server — server-only barrel for backend consumers.
 *
 * Re-exports the schema, errors, typed db services, and the PRD-113 phase-1
 * seed entrypoint. Distinct from `./index` (the React surface consumed by
 * the shell) so importing into Node-only code (pops-api seeder) doesn't pull
 * React, react-router, lucide, etc. into the dependency graph.
 */

export * from './db/schema';
export * from './db/errors';
export * from './db/services/ingredients';
export * from './db/services/variants';
export * from './db/services/prep-states';
export * from './db/services/recipes';
export * from './db/services/recipe-versions';
export * from './db/services/recipe-runs';
export * from './db/services/batches';
export * from './db/services/substitutions';
export * from './db/services/plan';
export { seedFood, type SeedFoodSummary } from './db/seed/index';
export type { FoodDb } from './db/services/internal';
