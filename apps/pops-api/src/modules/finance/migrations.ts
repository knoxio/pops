/**
 * Migration tags owned by the `finance` module.
 *
 * Most finance tables (transactions, budgets, transaction_corrections,
 * transaction_tag_rules) are created in the pre-modular baseline owned by
 * core — only follow-up ALTERs unambiguously scoped to finance live here.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const financeMigrationTags: readonly string[] = [
  // transaction_corrections: add is_active.
  '0025_youthful_hulk',
  // tag_vocabulary table.
  '0026_little_frank_castle',
  // transaction_corrections + transaction_tag_rules: priority columns +
  // indices + tag-rule backfill ordering.
  '0027_slow_dormammu',
  // budgets.active default flip (PRD-025 #2550).
  '0052_budgets_active_default_zero',
];

export const financeMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(financeMigrationTags);
