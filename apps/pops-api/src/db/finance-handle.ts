/**
 * Lazily-initialised handle to the finance pillar's SQLite file.
 *
 * Phase 2 PR 2 of the finance pillar migration: opens the connection
 * (and applies the in-package migrations journal, with the new
 * `0053_finance_pillar_baseline` ahead of 0025/0026/0027/0052) at boot
 * but does NOT yet route any production traffic through it. PR 3 of
 * phase 2 flips the wish-list slice over with a single edit to
 * `getDrizzle()` → `getFinanceDrizzle()` and adds the ATTACH-based
 * backfill from the legacy shared pops.db.
 *
 * Lives in its own module so `db.ts` stays under the lint cap as more
 * pillars come online. Mirrors `core-handle.ts` and `inventory-handle.ts`.
 */
import { openFinanceDb, type FinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';

let financeDb: OpenedFinanceDb | null = null;

/**
 * Resolve (and lazily open) the finance pillar's drizzle handle.
 *
 * The handle is opened here on first call so the per-pillar migrations
 * apply at boot. Phase 2 PR 2 does NOT yet route any production traffic
 * through it — the existing shared singleton continues to serve every
 * read/write. The handle is here so PR 3 can flip the wish-list slice
 * over with a one-line edit.
 */
export function getFinanceDrizzle(): FinanceDb {
  if (!financeDb) {
    financeDb = openFinanceDb(resolveFinanceSqlitePath());
  }
  return financeDb.db;
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
 * Test-only: swap the finance pillar handle. Phase 2 PR 3 of this
 * pillar wires `setupTestContext` (in `shared/test-utils.ts`) up to
 * call this hook so test suites can inject an in-memory DB and avoid
 * writing to the dev `data/finance.db` file. Returns the previous
 * handle (or null).
 */
export function setFinanceDb(next: OpenedFinanceDb | null): OpenedFinanceDb | null {
  const prev = financeDb;
  financeDb = next;
  return prev;
}
