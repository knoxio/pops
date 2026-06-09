/**
 * Migration tags owned by the `food` module.
 *
 * Append a tag here when a new food schema PRD lands its generated drizzle
 * migration. Order matches the on-disk filename order, which is the order
 * the runner applies them.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const foodMigrationTags: readonly string[] = [
  // PRD-106 — slug_registry + ingredients + variants + prep_states + aliases.
  '0058_high_sentinel',
  // PRD-107 — recipes + recipe_versions + recipe_tags.
  '0059_useful_hiroim',
  // PRD-108 — batches + recipe_runs + batch_consumptions; ALTER ingredient_variants
  // with default_shelf_life_days_{fridge,freezer}.
  '0060_familiar_leo',
];

export const foodMigrations: readonly MigrationDescriptor[] = drizzleMigrations(foodMigrationTags);
