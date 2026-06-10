/**
 * Migration tags owned by the `finance` module.
 *
 * The shared pre-modular baseline `0000_naive_chameleon.sql` (owned by core)
 * still creates `transactions` and `budgets`; the rest of the finance tables
 * — including `transaction_tag_rules` and `transaction_corrections` — live in
 * `@pops/finance-db`'s package-local migration journal and the corresponding
 * shared-journal copies were retired under Tracks L2 (#2861), N4, and N3.
 * Pulling those baseline tables out of `0000_naive_chameleon.sql` is tracked
 * separately as part of Track E's deferred follow-ups.
 *
 * After Track L2 there are no finance-owned tags left in the shared journal,
 * so the descriptor list below is empty.
 *
 * See PRD-101 US-09 for the runtime filter contract.
 */
import { drizzleMigrations } from '../../db/load-drizzle-migration.js';

import type { MigrationDescriptor } from '@pops/types';

export const financeMigrationTags: readonly string[] = [];

export const financeMigrations: readonly MigrationDescriptor[] =
  drizzleMigrations(financeMigrationTags);
