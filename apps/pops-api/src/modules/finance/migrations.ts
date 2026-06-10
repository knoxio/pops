/**
 * Migration tags owned by the `finance` module.
 *
 * The finance tables `transactions`, `budgets`, and `transaction_corrections`
 * are created in the pre-modular baseline `0000_naive_chameleon.sql` owned by
 * core; that baseline split is tracked separately (see Track E narrative).
 *
 * The four mid-history finance ALTER/recreate migrations
 * (0025/0026/0027/0052) were retired from the shared journal under Track L2
 * (#2861) once `@pops/finance-db` became the sole source of truth — hence the
 * empty tag list below.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const financeMigrationTags: readonly string[] = [];

export const financeMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(financeMigrationTags);
