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
  // PRD-109 — substitutions.
  '0061_shocking_skreet',
  // PRD-111 — plan_slots + plan_entries.
  '0063_bumpy_wolverine',
  // PRD-110 — ingest_sources.
  '0064_peaceful_magma',
  // PRD-116 — recipe_lines + recipe_steps + recipe_version_proposed_slugs.
  '0065_prd_116_recipe_compile',
  // PRD-123 — unit_conversions + ingredient_weights.
  '0066_prd_123_conversions',
  // PRD-125 amendment to PRD-110 — error_code/error_message/attempts columns on
  // ingest_sources (persists failure detail past BullMQ TTL).
  '0067_prd_125_ingest_error_columns',
];

export const foodMigrations: readonly MigrationDescriptor[] = drizzleMigrations(foodMigrationTags);
