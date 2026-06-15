/**
 * Backend-safe barrel for the food domain's persistence layer.
 *
 * Hosts food pillar tables (Phase 1 PR 1 surfaces `prep_states`; the
 * remaining slices — ingredients, variants, recipes, recipe_versions,
 * recipe_runs, batches, ingest_sources, plan_slots, plan_entries,
 * substitutions, unit_conversions, ingredient_tags, slug_registry, and
 * the DSL pipeline — follow in subsequent slice PRs). Extracted from
 * `@pops/app-food-db` per ADR-026 and the per-pillar plan documented in
 * `.claude/pillar-migration-roadmap.md`.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this
 * PR scaffolds the package and surfaces only the `prep_states` slice.
 * `@pops/app-food-db` continues to expose every other food table and
 * service unchanged; this barrel is purely additive.
 */
export * from './errors.js';
export * from './row-types.js';
export * from './schema.js';

export type { FoodDb } from './services/internal.js';

export { openFoodDb, type OpenedFoodDb } from './open-food-db.js';

export * as prepStatesService from './services/prep-states.js';
