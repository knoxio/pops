/**
 * Food domain — schema barrel.
 *
 * Per-PRD tables live in sibling files (each <200 lines to stay under the
 * max-lines lint cap):
 *
 *   - `food-ingredients.ts` — PRD-106 (slug_registry, ingredients, variants,
 *     prep_states, aliases). PRD-108 extends `ingredient_variants` with
 *     shelf-life columns; the column declarations live in that file too
 *     because Drizzle requires the full table definition in one place.
 *   - `food-recipes.ts` — PRD-107 (recipes, recipe_versions, recipe_tags).
 *   - `food-batches.ts` — PRD-108 (batches, recipe_runs, batch_consumptions).
 *   - `food-plan.ts` — PRD-111 (plan_slots, plan_entries).
 *   - `food-ingest-sources.ts` — PRD-110 (ingest_sources).
 *
 * This barrel is the import surface every other layer (db-types/src/index.ts,
 * `@pops/app-food`, drizzle-kit's schema glob) reads from.
 */
export * from './food-ingredients.js';
export * from './food-recipes.js';
export * from './food-batches.js';
export * from './food-plan.js';
export * from './food-ingest-sources.js';
