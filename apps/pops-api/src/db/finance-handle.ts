/**
 * Lazily-initialised handle to the finance pillar's SQLite file.
 *
 * Phase 2 PR 2 opened the connection (and applied the in-package
 * migrations journal) at boot. PR 3 routed every finance module read +
 * write through `getFinanceDrizzle()` (`finance.wishlist.*`,
 * `finance.budgets.*`, `finance.transactions.*`, the core entities +
 * corrections handlers, the tag-suggester job, search adapters) and ran
 * a one-shot ATTACH-based backfill from the legacy shared pops.db. PR 4
 * (Theme 13, 5th pillar FULL EXIT) retired the backfill — every
 * finance-owned table now writes directly to `finance.db`, so the boot
 * bridge has nothing left to carry forward.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors `core-handle.ts` / `inventory-handle.ts`.
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { getDb, isNamedEnvContext } from '../db.js';
import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';

let financeDb: OpenedFinanceDb | null = null;

/**
 * Resolve (and lazily open) the finance pillar's drizzle handle.
 *
 * **Env-aware**: inside a `withEnvDb()` scope (PRD-101 named environments —
 * each E2E test fixture creates a per-test pops.db with its own seeded
 * finance tables) the env DB takes precedence. The env DB already
 * contains the wish_list / entities / etc tables because
 * `seedDatabase()` writes them there, so a single fixture stays
 * self-contained without a background backfill into the global
 * `finance.db`. Outside an env scope (real production boot, dev),
 * the pillar's `finance.db` is resolved + lazily opened so the
 * in-package migrations apply.
 *
 * Phase 2 PR 3 routes wish-list reads/writes through this getter.
 */
export function getFinanceDrizzle(): FinanceDb {
  if (isNamedEnvContext()) return drizzle(getDb()) as FinanceDb;
  if (!financeDb) {
    financeDb = openFinanceDb(resolveFinanceSqlitePath());
  }
  return financeDb.db;
}

/**
 * Resolve the finance pillar's raw better-sqlite3 handle. Same lazy
 * open + env-aware behaviour as `getFinanceDrizzle()` — exposed for
 * the same lower-level needs (`.transaction()`, `.prepare()`,
 * `.pragma()`) that the drizzle wrapper hides. Prefer
 * `getFinanceDrizzle()` for everything that doesn't need it.
 */
export function getFinanceRawDb(): OpenedFinanceDb['raw'] {
  if (isNamedEnvContext()) return getDb();
  if (!financeDb) {
    financeDb = openFinanceDb(resolveFinanceSqlitePath());
  }
  return financeDb.raw;
}

/**
 * Close the finance pillar's connection if it was opened. Idempotent —
 * safe to call from `closeDb()` on shutdown even when the finance
 * handle was never resolved.
 */
export function closeFinanceDb(): void {
  if (financeDb) {
    financeDb.raw.close();
    financeDb = null;
  }
}

/**
 * Test-only: swap the finance pillar handle. `setupTestContext` in
 * `shared/test-utils.ts` calls this hook so test suites can inject an
 * in-memory DB and avoid writing to the dev `data/finance.db` file.
 * Returns the previous handle (or null).
 */
export function setFinanceDb(next: OpenedFinanceDb | null): OpenedFinanceDb | null {
  const prev = financeDb;
  financeDb = next;
  return prev;
}
