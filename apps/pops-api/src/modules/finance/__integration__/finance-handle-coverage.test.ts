/**
 * Finance pillar handle smoke harness — exercises every query procedure
 * mounted on `appRouter.finance.*` against a fresh per-pillar finance
 * SQLite opened through the canonical `openFinanceDb()` path.
 *
 * Catches the Track N4 (#2908) regression class: a procedure cut over
 * to `getFinanceDrizzle()` for a table that the pillar's package
 * migration journal does NOT yet create surfaces in production as
 * `SqliteError: no such table: <table>`. The smoke harness fails the
 * same way in CI before the cutover can land.
 *
 * Mental simulation: remove the `wish_list` CREATE statement from
 * `packages/finance-db/migrations/0053_finance_pillar_baseline.sql`
 * and re-run this suite — `finance.wishlist.list` + `finance.wishlist.get`
 * both fail with `no such table: wish_list`, surfacing the missing
 * migration before it ships. The same protection applies to every other
 * procedure mounted under `finance.*` that resolves a query against the
 * finance pillar handle.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '@pops/finance-db';

import { closeDb, setDb } from '../../../db.js';
import { setFinanceDb } from '../../../db/finance-handle.js';
import { appRouter } from '../../../router.js';
import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type PillarSmokeInputs,
} from '../../../shared/pillar-smoke-harness.js';
import { createCaller, createTestDb } from '../../../shared/test-utils.js';

/**
 * Minimal-input map for `finance.*` queries that require a non-empty
 * input shape. Procedures absent from the map default to `undefined`
 * (the harness tolerates Zod validation errors — they don't match
 * `no such table`). Keys ending in `.get` typically need an `{ id }`;
 * a non-existent id is fine because the SQL still runs.
 */
const FINANCE_INPUTS: PillarSmokeInputs = {
  'finance.transactions.list': {},
  'finance.transactions.get': { id: 'nonexistent-txn-id' },
  'finance.transactions.suggestTags': { description: 'Smoke harness probe' },
  'finance.transactions.listDescriptionsForPreview': {},
  'finance.budgets.list': {},
  'finance.budgets.get': { id: 'nonexistent-budget-id' },
  'finance.wishlist.list': {},
  'finance.wishlist.get': { id: 'nonexistent-wish-id' },
  'finance.imports.getImportProgress': {
    sessionId: '00000000-0000-0000-0000-000000000000',
  },
};

let financeHandle: OpenedFinanceDb | null = null;

beforeEach(() => {
  setDb(createTestDb());
  financeHandle = openFinanceDb(':memory:');
  setFinanceDb(financeHandle);
});

afterEach(() => {
  setFinanceDb(null);
  if (financeHandle) {
    financeHandle.raw.close();
    financeHandle = null;
  }
  closeDb();
});

describe('finance pillar handle smoke harness', () => {
  it('enumerates at least one finance query procedure (sanity)', () => {
    const queries = enumeratePillarQueries(appRouter, 'finance');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every finance query reaches its table on a fresh per-pillar DB', async () => {
    const caller = createCaller(true);
    const failures = await runPillarSmokeHarness(appRouter, caller, 'finance', {
      inputs: FINANCE_INPUTS,
    });

    if (failures.length > 0) {
      const detail = failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n');
      throw new Error(
        `Finance pillar smoke harness found ${failures.length.toString()} ` +
          `"no such table" failure(s). The fresh per-pillar finance.db is ` +
          `missing one or more tables that these procedures expect. Add ` +
          `the missing CREATE TABLE statement to a migration listed in ` +
          `packages/finance-db/migrations/meta/_journal.json:\n${detail}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('runs the entire finance smoke pass quickly (<5s)', async () => {
    const caller = createCaller(true);
    const started = Date.now();
    await runPillarSmokeHarness(appRouter, caller, 'finance', { inputs: FINANCE_INPUTS });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });
});
