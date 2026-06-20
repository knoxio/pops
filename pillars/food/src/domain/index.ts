/**
 * Internal barrel for the food pillar's shared domain types + utilities.
 *
 * Pure TS — no drizzle, no node:fs, no React. Types and helpers that
 * cross subdir boundaries (used by both `api/` and `worker/`, or
 * exposed to the FE feature module) live here.
 *
 *  - `slug.ts` — slug grammar + assertions
 *  - `recipe-renderer-types.ts` — joined display types for the recipe
 *    renderer (PRDs 119, 121)
 *  - `types/` — cook / batches / fridge / plan domain types (PRDs 143-147)
 */
export * from './slug.js';
export type {
  RecipeLineWithResolved,
  RecipeRendererProps,
  RecipeRendererVariant,
  RecipeVersionWithCompiledData,
} from './recipe-renderer-types.js';

export type * from './types/index.js';
export type {
  PlanEntryError,
  PlanEntryMutationResult,
  PlanEntryRow as WirePlanEntryRow,
  PlanSlotDeleteError,
  PlanSlotDeleteResult,
  PlanSlotError,
  PlanSlotMutationResult,
  PlanSlotRow as WirePlanSlotRow,
  PlanSlotUpdateError,
  PlanSlotUpdateResult,
  ReorderSlotError,
  ReorderSlotResult,
  WeekView,
} from './types/plan.js';
