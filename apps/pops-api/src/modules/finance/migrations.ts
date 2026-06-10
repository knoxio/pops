/**
 * Migration tags owned by the `finance` module.
 *
 * Most finance tables (transactions, budgets, transaction_corrections,
 * transaction_tag_rules) are created in the pre-modular baseline owned by
 * core. The four mid-history finance ALTERs (0025/0026/0027/0052) were
 * retired from the shared journal under Track L2 once `@pops/finance-db`
 * became the sole source of truth.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const financeMigrationTags: readonly string[] = [];

export const financeMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(financeMigrationTags);
